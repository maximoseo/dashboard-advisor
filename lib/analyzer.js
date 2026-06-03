'use strict';

const github = require('./github');

/**
 * Analysis engine.
 *
 * Given a dashboard (with a GitHub repo), fetch a snapshot of the code and run a
 * battery of heuristic checks across six categories. Each check is written to be
 * specific to what the code actually contains — it looks for the presence or
 * absence of concrete patterns rather than emitting generic advice.
 *
 * Categories: Features, UI/UX, Code Quality, Integrations, Performance, Security.
 */

const CATEGORIES = [
  'Features',
  'UI/UX',
  'Code Quality',
  'Integrations',
  'Performance',
  'Security',
];

// --- helpers --------------------------------------------------------------

function corpusFrom(snapshot) {
  // Concatenate all picked file contents + paths into one lowercase haystack.
  const fileText = Object.values(snapshot.files || {}).join('\n');
  const pathText = (snapshot.paths || []).join('\n');
  return {
    code: fileText,
    codeLower: fileText.toLowerCase(),
    paths: pathText,
    pathsLower: pathText.toLowerCase(),
    files: snapshot.files || {},
    pathList: snapshot.paths || [],
    meta: snapshot.meta || {},
  };
}

function has(corpus, ...needles) {
  return needles.some(
    (n) => corpus.codeLower.includes(n) || corpus.pathsLower.includes(n)
  );
}

function hasPath(corpus, re) {
  return corpus.pathList.some((p) => re.test(p));
}

function pkg(corpus) {
  const entry = Object.entries(corpus.files).find(([p]) => /package\.json$/i.test(p));
  if (!entry) return null;
  try {
    return JSON.parse(entry[1]);
  } catch {
    return null;
  }
}

function allDeps(pkgJson) {
  if (!pkgJson) return {};
  return { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
}

// A suggestion factory: keeps shape consistent.
function suggestion(category, title, description, priority) {
  return { category, title, description, priority };
}

// --- the checks -----------------------------------------------------------
// Each rule returns a suggestion or null.

function buildChecks(corpus) {
  const p = pkg(corpus);
  const deps = allDeps(p);
  const dep = (name) => Boolean(deps[name]);
  const lang = (corpus.meta.language || '').toLowerCase();

  return [
    // ---------------- Features ----------------
    () =>
      !has(corpus, 'search', 'filter', 'query')
        ? suggestion(
            'Features',
            'Add search & filtering',
            'No search or filtering logic was found in the code. Dashboards with many items benefit from a search box and category filters so users can quickly find what they need.',
            2
          )
        : null,
    () =>
      !has(corpus, 'export', 'csv', 'download', 'tojson')
        ? suggestion(
            'Features',
            'Add data export (CSV / JSON)',
            'There is no export capability detected. Letting users export the current view to CSV or JSON makes the dashboard far more useful for reporting and offline analysis.',
            3
          )
        : null,
    () =>
      !has(corpus, 'darkmode', 'dark-mode', 'theme-toggle', 'prefers-color-scheme', 'data-theme')
        ? suggestion(
            'Features',
            'Add a dark / light theme toggle',
            'No theme switching was detected. A persisted dark/light toggle (respecting prefers-color-scheme) is a low-effort, high-delight feature for a dashboard.',
            3
          )
        : null,
    () =>
      !hasPath(corpus, /manifest\.(json|webmanifest)$/i) &&
      !has(corpus, 'serviceworker', 'service-worker', 'manifest.json')
        ? suggestion(
            'Features',
            'Make it installable as a PWA',
            'No web app manifest or service worker found. Adding a manifest + service worker turns the dashboard into an installable PWA with offline support and a home-screen icon.',
            4
          )
        : null,
    () =>
      !has(corpus, 'websocket', 'socket.io', 'eventsource', 'sse', 'setinterval')
        ? suggestion(
            'Features',
            'Add live / real-time updates',
            'Data appears to load once with no polling or websocket detected. Live updates (SSE, websockets, or interval refresh) keep a monitoring dashboard current without manual reloads.',
            3
          )
        : null,

    // ---------------- UI/UX ----------------
    () =>
      !has(corpus, '@media', 'responsive', 'flex', 'grid-template', 'min-width', 'max-width')
        ? suggestion(
            'UI/UX',
            'Improve responsive / mobile layout',
            'Few or no responsive CSS constructs (media queries, fl/grid) were found. Ensure the layout reflows for tablet and phone widths.',
            2
          )
        : null,
    () =>
      !has(corpus, 'aria-', 'role=', 'alt=', 'tabindex')
        ? suggestion(
            'UI/UX',
            'Add accessibility (ARIA, alt text, focus)',
            'No ARIA attributes, alt text, or focus management detected. Add semantic roles, alt text on images, keyboard focus styles and labels so the dashboard is usable with assistive tech.',
            2
          )
        : null,
    () =>
      !has(corpus, 'transition', 'animation', '@keyframes', 'framer-motion')
        ? suggestion(
            'UI/UX',
            'Add subtle transitions & loading skeletons',
            'No CSS transitions/animations were found. Skeleton loaders and gentle transitions make the dashboard feel faster and more polished while data loads.',
            4
          )
        : null,
    () =>
      !has(corpus, 'empty', 'no data', 'no results', 'nothing here')
        ? suggestion(
            'UI/UX',
            'Design empty & error states',
            'No explicit empty/error state handling was detected in the UI. Friendly empty states and error messages prevent confusing blank screens.',
            3
          )
        : null,

    // ---------------- Code Quality ----------------
    () =>
      !has(corpus, 'try', 'catch', '.catch(')
        ? suggestion(
            'Code Quality',
            'Add error handling around async calls',
            'Very little try/catch or promise .catch() handling was found. Wrap network and async operations so failures are surfaced gracefully instead of crashing.',
            1
          )
        : null,
    () =>
      !dep('typescript') && lang !== 'typescript' && !hasPath(corpus, /\.tsx?$/)
        ? suggestion(
            'Code Quality',
            'Migrate to TypeScript',
            'The project is plain JavaScript. Adding TypeScript (even incrementally via JSDoc + checkJs) catches a whole class of bugs before they ship.',
            4
          )
        : null,
    () =>
      !hasPath(corpus, /(test|spec)\.[jt]sx?$/i) &&
      !hasPath(corpus, /(^|\/)(tests?|__tests__)\//i) &&
      !dep('jest') &&
      !dep('vitest') &&
      !dep('mocha')
        ? suggestion(
            'Code Quality',
            'Add automated tests',
            'No test files or test runner (jest/vitest/mocha) were found. A small suite around the data layer and API routes guards against regressions.',
            2
          )
        : null,
    () =>
      !dep('eslint') && !hasPath(corpus, /\.eslintrc/i)
        ? suggestion(
            'Code Quality',
            'Add ESLint + Prettier',
            'No linter configuration detected. ESLint + Prettier enforce a consistent style and catch common mistakes automatically in CI.',
            4
          )
        : null,
    () =>
      !has(corpus, 'logger', 'winston', 'pino', 'console.error')
        ? suggestion(
            'Code Quality',
            'Add structured logging',
            'No logging library or error logging was found. Structured logging (pino/winston) makes production issues diagnosable instead of invisible.',
            3
          )
        : null,

    // ---------------- Integrations ----------------
    () =>
      !has(corpus, 'gtag', 'analytics', 'plausible', 'posthog', 'mixpanel')
        ? suggestion(
            'Integrations',
            'Add product analytics',
            'No analytics integration detected. A privacy-friendly analytics tool (Plausible/PostHog) shows which dashboard features are actually used.',
            4
          )
        : null,
    () =>
      !has(corpus, 'sentry', 'bugsnag', 'rollbar')
        ? suggestion(
            'Integrations',
            'Add error monitoring (Sentry)',
            'No error-monitoring SDK found. Wiring up Sentry surfaces client and server exceptions with stack traces and release tracking.',
            3
          )
        : null,
    () =>
      !has(corpus, 'webhook', 'slack', 'telegram', 'notify', 'notification')
        ? suggestion(
            'Integrations',
            'Add notifications / alerting',
            'No notification hook detected. Pushing important changes to Slack/Telegram or browser notifications keeps users informed without watching the screen.',
            4
          )
        : null,

    // ---------------- Performance ----------------
    () =>
      !has(corpus, 'lazy', 'loading="lazy"', 'dynamic import', 'import(')
        ? suggestion(
            'Performance',
            'Lazy-load heavy assets & code',
            'No lazy loading or code-splitting detected. Defer offscreen images (loading="lazy") and dynamically import heavy modules to cut initial load time.',
            3
          )
        : null,
    () =>
      !has(corpus, 'cache-control', 'etag', 'max-age', 'swr', 'react-query', 'localstorage')
        ? suggestion(
            'Performance',
            'Add caching for API responses',
            'No client or HTTP caching detected. Cache API responses (SWR/React Query or Cache-Control headers) to avoid refetching unchanged data.',
            3
          )
        : null,
    () =>
      !has(corpus, 'compression', 'gzip', 'brotli')
        ? suggestion(
            'Performance',
            'Enable gzip / brotli compression',
            'No response compression detected. Enabling compression (e.g. the compression middleware) significantly shrinks payload sizes over the wire.',
            4
          )
        : null,

    // ---------------- Security ----------------
    () =>
      !has(corpus, 'content-security-policy', 'helmet', 'contentsecuritypolicy')
        ? suggestion(
            'Security',
            'Add security headers (CSP via Helmet)',
            'No Content-Security-Policy or Helmet usage found. Security headers (CSP, X-Frame-Options, HSTS) mitigate XSS and clickjacking with minimal effort.',
            1
          )
        : null,
    () =>
      !has(corpus, 'rate-limit', 'ratelimit', 'express-rate-limit', 'slow-down')
        ? suggestion(
            'Security',
            'Add rate limiting to the API',
            'No rate limiting detected on the server. Rate limiting protects endpoints from abuse and accidental request storms.',
            2
          )
        : null,
    () =>
      !has(corpus, 'validate', 'zod', 'joi', 'yup', 'sanitize', 'escape')
        ? suggestion(
            'Security',
            'Validate & sanitize input',
            'No input validation library (zod/joi/yup) or sanitization found. Validate request payloads and escape user-supplied content to prevent injection.',
            1
          )
        : null,
    () =>
      has(corpus, 'http://') && !has(corpus, 'localhost', '127.0.0.1')
        ? suggestion(
            'Security',
            'Use HTTPS everywhere',
            'Plain http:// URLs were found in the code. Ensure all external requests and asset references use https to avoid mixed-content and interception.',
            2
          )
        : null,
  ];
}

/**
 * Run the engine for one dashboard. Returns { dashboard, suggestions, summary }.
 * `suggestions` are plain objects (category/title/description/priority); the
 * caller is responsible for persisting them.
 */
async function analyzeDashboard(dashboard) {
  if (!dashboard) throw new Error('No dashboard provided');

  // No repo → fall back to a generic-but-honest baseline.
  if (!dashboard.github) {
    return {
      dashboard,
      analyzedRepo: null,
      suggestions: baselineSuggestions(),
      summary:
        'No GitHub repository is configured for this dashboard, so suggestions are based on common dashboard best practices rather than the actual code.',
    };
  }

  let snapshot;
  try {
    snapshot = await github.snapshotRepo(dashboard.github);
  } catch (err) {
    return {
      dashboard,
      analyzedRepo: dashboard.github,
      error: err.message,
      suggestions: baselineSuggestions(),
      summary: `Could not read the repository (${err.message}). Falling back to general best-practice suggestions.`,
    };
  }

  const corpus = corpusFrom(snapshot);
  const checks = buildChecks(corpus);
  const suggestions = checks.map((fn) => fn()).filter(Boolean);

  const summary =
    `Analyzed ${Object.keys(snapshot.files).length} key files across ` +
    `${snapshot.paths.length} total in ${dashboard.github} ` +
    `(${snapshot.meta.language || 'unknown language'}). ` +
    `Found ${suggestions.length} improvement opportunities.`;

  return {
    dashboard,
    analyzedRepo: dashboard.github,
    fileCount: snapshot.paths.length,
    language: snapshot.meta.language || null,
    suggestions,
    summary,
  };
}

// When we can't read code, still offer the highest-value universal items.
function baselineSuggestions() {
  return [
    suggestion(
      'Security',
      'Add security headers (CSP)',
      'Add a Content-Security-Policy and standard security headers (X-Frame-Options, HSTS) to mitigate XSS and clickjacking.',
      1
    ),
    suggestion(
      'Code Quality',
      'Add error handling & logging',
      'Ensure async/network operations are wrapped in error handling and that failures are logged for diagnosis.',
      2
    ),
    suggestion(
      'Features',
      'Add search, export, and a theme toggle',
      'Common dashboard wins: a search/filter box, CSV/JSON export, and a persisted dark/light theme toggle.',
      3
    ),
    suggestion(
      'Performance',
      'Cache API responses & compress output',
      'Cache unchanged API data on the client and enable gzip/brotli compression to reduce load times.',
      3
    ),
    suggestion(
      'UI/UX',
      'Improve responsiveness & accessibility',
      'Verify the layout reflows on mobile and add ARIA roles, alt text, and keyboard focus styles.',
      3
    ),
  ];
}

module.exports = { analyzeDashboard, CATEGORIES };
