# 💡 Dashboard Advisor

A Node.js service that analyzes dashboards by reading their GitHub source code and
suggests concrete improvements — surfaced through a beautiful floating widget you can
drop onto any dashboard with a single `<script>` tag.

## What it does

1. Reads a dashboard's GitHub repo via the GitHub API.
2. Runs a heuristic analysis engine across six categories:
   **Features · UI/UX · Code Quality · Integrations · Performance · Security**.
3. Stores the resulting suggestions in Supabase (via the REST API — no SDK).
4. Serves a floating `💡` widget that shows suggestions grouped by category, each with a
   priority badge and an **Execute** button.
5. Executing a suggestion dispatches it to the locally-running **Paperclip** CLI as a task,
   routed to the most appropriate agent (Claude / Codex / Designer / Planner).

## Architecture

```
server.js            Express app (port 3000) — all endpoints + CORS
lib/config.js        Central config + hardcoded dashboard list (secrets via env only)
lib/github.js        GitHub REST client — snapshots a repo's code
lib/analyzer.js      The analysis engine (category checks)
lib/supabase.js      Supabase REST (PostgREST) client
lib/paperclip.js     Paperclip task dispatcher
public/widget.js     Self-contained floating widget (dark theme, responsive)
```

## Endpoints

| Method | Path                | Purpose                                            |
| ------ | ------------------- | -------------------------------------------------- |
| GET    | `/widget.js`        | Serves the widget JS (CORS-enabled, cacheable)     |
| GET    | `/api/dashboards`   | Lists all configured dashboards                    |
| POST   | `/api/analyze`      | Analyzes a dashboard's repo, stores + returns tips |
| GET    | `/api/suggestions`  | Reads suggestions from Supabase                    |
| POST   | `/api/execute`      | Sends a suggestion to Paperclip as a task          |
| GET    | `/health`           | Health check + integration status                  |

`POST /api/analyze` body: `{ "dashboardId": "telegram-bots-dashboard" }`
`POST /api/execute` body: `{ "id": "<supabase-suggestion-id>" }`

## Embedding the widget

```html
<script
  src="https://your-advisor.onrender.com/widget.js"
  data-dashboard-id="telegram-bots-dashboard"
  data-api="https://your-advisor.onrender.com"></script>
```

The widget reads `data-dashboard-id` and `data-api` from its own script tag, works on
mobile, and degrades gracefully if the advisor API is down.

## Configuration

All secrets come from environment variables — nothing sensitive is hardcoded.
See [`.env.example`](./.env.example).

## Run locally

```bash
npm install
cp .env.example .env   # then fill in values
npm start              # http://localhost:3000
```

## Deploy

`render.yaml` is included for one-click deploy on Render. Set the `sync: false`
secrets in the Render dashboard.
