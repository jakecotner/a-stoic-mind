---
name: verify
description: Build, launch, and drive the Stoa app (FastAPI backend + Vite React frontend) to verify changes at the browser surface.
---

# Verifying Stoa changes

## Launch

1. Postgres: docker container `stoa-db` (localhost:5433) is usually already
   up — check `docker ps --filter name=stoa-db`. Never `docker compose down`.
2. Backend (from `stoa/backend/`, port 8001 — 8000 belongs to another project):
   `.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001`
3. Frontend (from `stoa/frontend/`): `npm run dev` → http://localhost:5173
   (Vite proxies /api to 8001). Typecheck+build: `npm run build`.

Both launch fine as background tasks; probe readiness with
`Invoke-WebRequest http://localhost:8001/api/daily` and `:5173`.

## Drive (browser)

No Playwright installed. What works: `npm install puppeteer-core` in the
scratchpad and drive the installed Chrome at
`C:\Program Files\Google\Chrome\Application\chrome.exe` (headless "new").

- Auth: register/login in-page via
  `fetch("/api/auth/register", {json {email, password}})` then
  `fetch("/api/auth/login", {body: new URLSearchParams({username, password})})`,
  then reload — cookie session. Use a throwaway
  `verify-<something>@example.com` user per run.
- Journal flow: type into `.journal-compose textarea`, click the
  "Save & reflect with the Stoa" button in `.note-compose-actions`.
  The reflection thread lives in the LEFT pane (`.stoa-pane .stoa-thread`);
  the entry/editor in the RIGHT pane (`.entry-pane`).

## Gotchas

- Streaming: the thread's follow-up `textarea` is `disabled` while the LLM
  streams — `waitForSelector(".thread-composer textarea:not([disabled])")`
  before typing a follow-up, and allow 60–90s for LLM responses.
- The daily breakdown streams on every page load (real LLM calls) — each
  full drive costs a few LLM requests.
- Signed-out load logs one 404 (favicon) and two 401s (`/api/auth/me`,
  `/api/notes`) in the console — pre-existing noise, not failures.
- Multiple Claude sessions edit this repo in parallel; don't kill servers
  you didn't start, don't commit.
