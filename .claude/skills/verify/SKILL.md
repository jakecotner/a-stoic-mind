---
name: verify
description: Build, launch, and drive the app (FastAPI backend + Next.js frontend) to verify changes at the browser surface.
---

# Verifying changes

## Launch

1. Postgres: `docker compose up -d` from `backend/` (container `astoicmind-db`,
   localhost:5436), then `python -m alembic upgrade head`.
2. Backend (from `backend/`):
   `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
3. Frontend (from `frontend/`): `npx next dev -p 3000` →
   http://localhost:3000 (Next rewrites proxy `/api` to 8000; override the
   target with the `API_URL` env var). Typecheck + build: `npm run build`.

Both launch fine as background tasks; probe readiness with
`Invoke-WebRequest http://localhost:8000/api/health` and `:3000`.
Drive everything through the **Next origin (3000)** — that exercises the
rewrite proxy the way production does.

## Drive

HTTP-level flows can be driven with `Invoke-WebRequest -SessionVariable s`
(cookies persist across calls): register via POST `/api/auth/register`
(JSON), login via POST `/api/auth/login` (form body
`username=<email>&password=...` — fastapi-users expects form fields), then
authed GETs ride the cookie. Use a throwaway
`verify-<something>@example.com` user per run.

For real browser drives: no Playwright installed. What works:
`npm install puppeteer-core` in the scratchpad and drive the installed
Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`
(headless "new").

## Gotchas

- `/api/chat` makes real LLM calls (needs `ANTHROPIC_API_KEY` in
  `backend/.env`) and streams SSE; allow 60–90s. Without a key the stream
  returns an `error` event — that's the graceful-degradation path, not a
  crash.
- Password reset in dev: no `RESEND_API_KEY` means the email is LOGGED by
  the backend instead of sent — grab the `/reset-password?token=...` link
  from the backend's stderr.
- With Stripe env vars unset, checkout/portal return 503 and the account
  page shows "payments aren't live yet" — expected, not a failure.
- Don't kill servers you didn't start; the user may run their own.
