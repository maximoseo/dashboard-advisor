'use strict';

/**
 * Central configuration. Every secret comes from an environment variable —
 * nothing sensitive is ever hardcoded here.
 */

const PORT = parseInt(process.env.PORT, 10) || 3000;

// --- Supabase -------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Table holding suggestions (already created in Supabase).
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'dashboard_suggestions';

// --- GitHub ---------------------------------------------------------------
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// --- Paperclip ------------------------------------------------------------
// Paperclip CLI runs locally; the base URL and the route used to create a task
// are both configurable so the integration can be pointed at the right host.
// The company and agent IDs below are non-secret identifiers (Maximo SEO) and
// double as defaults; the only real secret (PAPERCLIP_API_KEY) stays env-only.
const PAPERCLIP_URL = process.env.PAPERCLIP_URL || 'http://127.0.0.1:3100';
const PAPERCLIP_TASK_PATH = process.env.PAPERCLIP_TASK_PATH || '/api/tasks';
const PAPERCLIP_COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || 'f0910fc4-92ca-48e9-847b-9523eff24cd5'; // Maximo SEO
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY || '';

// Paperclip agents. Defaults are the Maximo SEO agent IDs; override via env.
// Each suggestion category is routed to the most suitable agent.
const PAPERCLIP_AGENTS = {
  claude: process.env.PAPERCLIP_AGENT_CLAUDE || 'f43b18a1-5038-480c-b5a6-96359858510e', // general
  codex: process.env.PAPERCLIP_AGENT_CODEX || '3bec0bdc-8e12-4290-93d5-18d1e1b06992', // general
  designer: process.env.PAPERCLIP_AGENT_DESIGNER || '03964597-9f64-4fd2-a03b-68730fced757', // designer
  planner: process.env.PAPERCLIP_AGENT_PLANNER || '11902ce6-7311-469e-b42a-b4a95c523329', // pm
};

// Maps a suggestion category to the agent role best suited to execute it.
const CATEGORY_AGENT = {
  Features: 'claude',
  'UI/UX': 'designer',
  'Code Quality': 'codex',
  Integrations: 'claude',
  Performance: 'codex',
  Security: 'codex',
};

// --- Dashboards (hardcoded config) ---------------------------------------
const DASHBOARDS = [
  {
    id: 'telegram-bots-dashboard',
    name: 'Telegram Bots Dashboard',
    github: 'maximoseo/telegram-bots-dashboard',
    url: 'https://telegram-bots-dashboard.onrender.com',
  },
  {
    id: 'paperclip-control-center',
    name: 'Paperclip Control Center',
    github: 'maximoseo/paperclip-control-center',
    url: 'https://paperclip-control-center-v2.onrender.com',
  },
  {
    id: 'gbp-dashboard',
    name: 'GBP Dashboard',
    github: 'maximoseo/gbp-dashboard',
    url: 'https://gbp-dashboard.onrender.com',
  },
  {
    id: 'github-repos-radar',
    name: 'GitHub Repos Radar',
    github: 'maximoseo/github-repos-radar',
    url: 'https://github-repos-radar.maximo-seo.ai',
  },
  {
    id: 'dashboards-panel',
    name: 'Dashboards Panel',
    github: null, // no repo configured
    url: 'https://dashboards-panel.maximo-seo.ai',
  },
];

function findDashboard(idOrUrl) {
  if (!idOrUrl) return null;
  return (
    DASHBOARDS.find((d) => d.id === idOrUrl) ||
    DASHBOARDS.find((d) => d.url === idOrUrl) ||
    DASHBOARDS.find((d) => idOrUrl.startsWith(d.url)) ||
    null
  );
}

module.exports = {
  PORT,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_TABLE,
  GITHUB_TOKEN,
  PAPERCLIP_URL,
  PAPERCLIP_TASK_PATH,
  PAPERCLIP_COMPANY_ID,
  PAPERCLIP_API_KEY,
  PAPERCLIP_AGENTS,
  CATEGORY_AGENT,
  DASHBOARDS,
  findDashboard,
};
