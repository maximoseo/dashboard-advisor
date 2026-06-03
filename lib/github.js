'use strict';

const { GITHUB_TOKEN } = require('./config');

/**
 * Minimal GitHub REST client used by the analyzer to read a repo's code.
 */

const API = 'https://api.github.com';

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dashboard-advisor',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) h.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return h;
}

async function ghFetch(path) {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (res.status === 404) {
    const err = new Error(`GitHub 404: ${path}`);
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Repo metadata: description, language, topics, default branch, etc. */
async function getRepoMeta(repo) {
  return ghFetch(`/repos/${repo}`);
}

/**
 * Recursively list the file tree for the default branch using the Git Trees API
 * (one request instead of walking directories).
 */
async function getRepoTree(repo, branch) {
  const data = await ghFetch(
    `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  return Array.isArray(data.tree) ? data.tree : [];
}

/** Fetch and decode a single text file. Returns '' if it can't be read. */
async function getFileContent(repo, path) {
  try {
    const data = await ghFetch(`/repos/${repo}/contents/${encodeURIComponent(path)}`);
    if (data && data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
  } catch {
    /* swallow — missing/binary file */
  }
  return '';
}

/**
 * Build a snapshot of a repository: metadata, the list of file paths, and the
 * concatenated text of a handful of "interesting" source files (capped in size).
 */
async function snapshotRepo(repo, { maxFiles = 12, maxBytes = 120000 } = {}) {
  const meta = await getRepoMeta(repo);
  const branch = meta.default_branch || 'main';
  const tree = await getRepoTree(repo, branch);

  const paths = tree.filter((n) => n.type === 'blob').map((n) => n.path);

  // Prioritise files that reveal the app's shape.
  const PRIORITY = [
    /package\.json$/i,
    /(^|\/)(index|app|main|server)\.(js|ts|jsx|tsx)$/i,
    /\.(jsx|tsx)$/i,
    /(^|\/)src\/.*\.(js|ts)$/i,
    /\.html$/i,
    /(^|\/)README\.md$/i,
  ];

  const scored = paths
    .map((p) => {
      const idx = PRIORITY.findIndex((re) => re.test(p));
      return { path: p, score: idx === -1 ? PRIORITY.length : idx };
    })
    .sort((a, b) => a.score - b.score);

  const picked = scored.slice(0, maxFiles).map((s) => s.path);

  const files = {};
  let total = 0;
  for (const p of picked) {
    if (total >= maxBytes) break;
    const content = await getFileContent(repo, p);
    if (content) {
      const slice = content.slice(0, maxBytes - total);
      files[p] = slice;
      total += slice.length;
    }
  }

  return { meta, branch, paths, files };
}

module.exports = {
  getRepoMeta,
  getRepoTree,
  getFileContent,
  snapshotRepo,
  isConfigured: () => Boolean(GITHUB_TOKEN),
};
