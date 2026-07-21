# Stoa — dev notes

- **Backend port: 8001**, not 8000 — port 8000 belongs to a different project
  the user runs on this machine. Start with:
  `.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001`
  (run from `backend/`). The Vite dev proxy targets 8001
  (see `frontend/vite.config.ts`; override with `STOA_API_URL`).
- Postgres runs in the shared Docker container "stoa-db" (localhost:5433,
  stoa/stoa/stoa). Never `docker compose down` it; restarting uvicorn is fine.
- Run alembic as `python -m alembic` (the exe entry point can't import `app`).
- Multiple Claude sessions work in this repo in parallel; the user coordinates
  git commits — do not commit or push unless asked.
