---
name: run-one
description: Run, serve, launch, or preview the ONE Platform. Use when asked to run/start the API server (Cloudflare Worker) or the frontend (Cloudflare Pages dev server).
---

# Run ONE Platform

ONE Platform runs as two services:
- **API** — Cloudflare Worker (Hono), served with `wrangler dev`
- **Frontend** — Static SPA, served with `wrangler pages dev`

## Prerequisites

```bash
npm install          # install workspace dependencies (from repo root)
```

## Run API

```bash
cd packages/api && npx wrangler dev --port 8787
```

The API is available at `http://localhost:8787`. Health check: `GET /health`.

## Run Frontend

```bash
cd packages/web && npx wrangler pages dev . --port 3000
```

Open `http://localhost:3000` in a browser.

## Run Both

In two terminals:
```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — Frontend
npm run dev:web
```

## Screenshot (agent path)

```bash
node .claude/skills/run-ortrack/driver.mjs packages/web/index.html .claude/skills/run-ortrack/_login.png 8765
```

## Database

Local D1 database (SQLite):
```bash
npx wrangler d1 migrations apply one-db --local
```

## Gotchas

- **`EADDRINUSE`** — a server from an interrupted run is still alive. Pass a different port.
- **D1 local** — `wrangler dev` creates a local D1 database; data is not shared with production.
- The frontend expects the API at `/api/v1/*` — configure proxying or CORS as needed.
