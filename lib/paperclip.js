'use strict';

const {
  PAPERCLIP_URL,
  PAPERCLIP_TASK_PATH,
  PAPERCLIP_COMPANY_ID,
  PAPERCLIP_API_KEY,
  PAPERCLIP_AGENTS,
  CATEGORY_AGENT,
} = require('./config');

/**
 * Sends a suggestion to the locally-running Paperclip CLI as a task.
 */

function isConfigured() {
  return Boolean(PAPERCLIP_URL);
}

function agentForCategory(category) {
  const role = CATEGORY_AGENT[category] || 'claude';
  return { role, id: PAPERCLIP_AGENTS[role] || '' };
}

function taskUrl() {
  return `${PAPERCLIP_URL.replace(/\/$/, '')}${PAPERCLIP_TASK_PATH}`;
}

/**
 * Create a Paperclip task from a stored suggestion. Returns the parsed
 * Paperclip response (or throws on a non-2xx).
 */
async function createTask(suggestion) {
  if (!isConfigured()) throw new Error('Paperclip is not configured');

  const { role, id: agentId } = agentForCategory(suggestion.category);

  const prompt =
    `Improve the dashboard "${suggestion.dashboard_id}" (${suggestion.dashboard_url}).\n\n` +
    `Category: ${suggestion.category}\n` +
    `Task: ${suggestion.title}\n\n` +
    `${suggestion.description}\n\n` +
    `Implement this improvement in the dashboard's repository and open a PR.`;

  const body = {
    company_id: PAPERCLIP_COMPANY_ID,
    agent: agentId || role,
    agent_role: role,
    title: suggestion.title,
    prompt,
    metadata: {
      source: 'dashboard-advisor',
      suggestion_id: suggestion.id,
      dashboard_id: suggestion.dashboard_id,
      dashboard_url: suggestion.dashboard_url,
      category: suggestion.category,
      priority: suggestion.priority,
    },
  };

  const headers = { 'Content-Type': 'application/json' };
  if (PAPERCLIP_API_KEY) headers.Authorization = `Bearer ${PAPERCLIP_API_KEY}`;

  const res = await fetch(taskUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const err = new Error(
      `Paperclip ${res.status}: ${
        (parsed && parsed.error) || (typeof parsed === 'string' ? parsed : res.statusText)
      }`
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }

  return { agent: agentId || role, agentRole: role, response: parsed };
}

module.exports = { isConfigured, createTask, agentForCategory };
