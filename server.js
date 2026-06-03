'use strict';

const path = require('path');
const express = require('express');

const config = require('./lib/config');
const supabase = require('./lib/supabase');
const paperclip = require('./lib/paperclip');
const { analyzeDashboard } = require('./lib/analyzer');

const app = express();
app.use(express.json({ limit: '256kb' }));

// --- CORS -----------------------------------------------------------------
// The widget is embedded on other origins, so the API and widget must be
// reachable cross-origin.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// -------------------------------------------------------------------------
// 1. GET /widget.js — serve the floating widget (CORS-enabled, cacheable)
// -------------------------------------------------------------------------
app.get('/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});

// -------------------------------------------------------------------------
// 2. GET /api/dashboards — list all dashboards from hardcoded config
// -------------------------------------------------------------------------
app.get('/api/dashboards', (req, res) => {
  res.json({ dashboards: config.DASHBOARDS });
});

// -------------------------------------------------------------------------
// 3. POST /api/analyze — analyze a dashboard via its GitHub repo code,
//    store suggestions in Supabase, and return them.
//    Body: { dashboardId } or { url }
// -------------------------------------------------------------------------
app.post('/api/analyze', async (req, res) => {
  try {
    const { dashboardId, url } = req.body || {};
    const dashboard = config.findDashboard(dashboardId || url);
    if (!dashboard) {
      return res.status(404).json({ error: 'Unknown dashboard', dashboardId, url });
    }

    const result = await analyzeDashboard(dashboard);

    // Persist to Supabase (best-effort — analysis still returns if storage fails).
    let stored = [];
    let storageError = null;
    if (supabase.isConfigured()) {
      try {
        await supabase.deleteSuggestionsForDashboard(dashboard.id);
        const rows = result.suggestions.map((s) => ({
          dashboard_id: dashboard.id,
          dashboard_url: dashboard.url,
          category: s.category,
          title: s.title,
          description: s.description,
          priority: s.priority,
          status: 'pending',
          agent: paperclip.agentForCategory(s.category).role,
        }));
        stored = await supabase.insertSuggestions(rows);
      } catch (err) {
        storageError = err.message;
      }
    } else {
      storageError = 'Supabase not configured — suggestions not persisted';
    }

    res.json({
      dashboard,
      summary: result.summary,
      analyzedRepo: result.analyzedRepo,
      language: result.language || null,
      fileCount: result.fileCount || null,
      // Prefer stored rows (they carry ids needed for Execute); fall back to raw.
      suggestions: stored.length ? stored : result.suggestions,
      storageError,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 4. GET /api/suggestions — read suggestions from Supabase
//    Query: ?dashboardId=...&status=...
// -------------------------------------------------------------------------
app.get('/api/suggestions', async (req, res) => {
  try {
    if (!supabase.isConfigured()) {
      return res.json({ suggestions: [], note: 'Supabase not configured' });
    }
    const { dashboardId, status } = req.query;
    const suggestions = await supabase.getSuggestions({ dashboardId, status });
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------------------
// 5. POST /api/execute — send a suggestion to Paperclip as a task
//    Body: { id }  (suggestion id in Supabase)
// -------------------------------------------------------------------------
app.post('/api/execute', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing suggestion id' });

    let suggestion;
    if (supabase.isConfigured()) {
      suggestion = await supabase.getSuggestionById(id);
      if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    } else {
      // Allow execution with an inline suggestion payload when storage is off.
      suggestion = req.body.suggestion;
      if (!suggestion) {
        return res
          .status(400)
          .json({ error: 'Supabase not configured and no inline suggestion provided' });
      }
    }

    const taskResult = await paperclip.createTask(suggestion);

    // Mark as executed in Supabase.
    let updated = null;
    if (supabase.isConfigured()) {
      updated = await supabase.updateSuggestion(id, {
        status: 'executing',
        agent: taskResult.agent,
        executed_at: new Date().toISOString(),
        result: JSON.stringify(taskResult.response),
      });
    }

    res.json({ ok: true, agent: taskResult.agent, task: taskResult.response, suggestion: updated });
  } catch (err) {
    res.status(502).json({ error: err.message, details: err.body || null });
  }
});

// -------------------------------------------------------------------------
// 6. GET /health — health check
// -------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dashboard-advisor',
    time: new Date().toISOString(),
    integrations: {
      supabase: supabase.isConfigured(),
      github: require('./lib/github').isConfigured(),
      paperclip: paperclip.isConfigured(),
    },
    dashboards: config.DASHBOARDS.length,
  });
});

// Simple landing page so the root isn't a 404.
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    `<!doctype html><meta charset="utf-8"><title>Dashboard Advisor</title>` +
      `<body style="font-family:system-ui;background:#0b0f17;color:#e6edf3;padding:40px;max-width:680px;margin:auto">` +
      `<h1>💡 Dashboard Advisor</h1>` +
      `<p>Analyzes dashboards and suggests improvements. Embed the widget with:</p>` +
      `<pre style="background:#111827;padding:16px;border-radius:8px;overflow:auto">` +
      `&lt;script src="/widget.js" data-dashboard-id="my-dashboard" data-api="${''}"&gt;&lt;/script&gt;</pre>` +
      `<p>Endpoints: <code>/api/dashboards</code>, <code>/api/analyze</code>, ` +
      `<code>/api/suggestions</code>, <code>/api/execute</code>, <code>/health</code></p>` +
      `</body>`
  );
});

if (require.main === module) {
  app.listen(config.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Dashboard Advisor listening on :${config.PORT}`);
  });
}

module.exports = app;
