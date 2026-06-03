'use strict';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_TABLE,
} = require('./config');

/**
 * Thin wrapper over the Supabase REST (PostgREST) API. We deliberately avoid
 * the @supabase/supabase-js SDK to keep dependencies minimal.
 */

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function baseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function restUrl(path = '') {
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}${path}`;
}

async function request(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const message =
      (body && body.message) || (typeof body === 'string' ? body : res.statusText);
    const err = new Error(`Supabase ${res.status}: ${message}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/**
 * Insert an array of suggestion rows. Returns the inserted rows.
 */
async function insertSuggestions(rows) {
  if (!isConfigured()) throw new Error('Supabase is not configured');
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return request(restUrl(), {
    method: 'POST',
    headers: baseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  });
}

/**
 * Delete suggestions for a dashboard so a fresh analysis replaces stale rows.
 */
async function deleteSuggestionsForDashboard(dashboardId) {
  if (!isConfigured()) throw new Error('Supabase is not configured');
  const url = restUrl(`?dashboard_id=eq.${encodeURIComponent(dashboardId)}`);
  return request(url, {
    method: 'DELETE',
    headers: baseHeaders({ Prefer: 'return=minimal' }),
  });
}

/**
 * Fetch suggestions, optionally filtered by dashboard id.
 */
async function getSuggestions({ dashboardId, status } = {}) {
  if (!isConfigured()) throw new Error('Supabase is not configured');
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'priority.asc,created_at.desc');
  if (dashboardId) params.set('dashboard_id', `eq.${dashboardId}`);
  if (status) params.set('status', `eq.${status}`);
  return request(restUrl(`?${params.toString()}`), {
    method: 'GET',
    headers: baseHeaders(),
  });
}

async function getSuggestionById(id) {
  if (!isConfigured()) throw new Error('Supabase is not configured');
  const url = restUrl(`?id=eq.${encodeURIComponent(id)}&select=*`);
  const rows = await request(url, { method: 'GET', headers: baseHeaders() });
  return Array.isArray(rows) ? rows[0] || null : null;
}

/**
 * Patch a suggestion row (e.g. mark executed with a result payload).
 */
async function updateSuggestion(id, patch) {
  if (!isConfigured()) throw new Error('Supabase is not configured');
  const url = restUrl(`?id=eq.${encodeURIComponent(id)}`);
  const rows = await request(url, {
    method: 'PATCH',
    headers: baseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = {
  isConfigured,
  insertSuggestions,
  deleteSuggestionsForDashboard,
  getSuggestions,
  getSuggestionById,
  updateSuggestion,
};
