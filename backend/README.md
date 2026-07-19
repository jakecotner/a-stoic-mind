# A Stoic Mind — backend

FastAPI backend for a Stoic-quotes chat companion: a sourced-passage corpus in
Postgres (+pgvector), retrieval, and a streaming Claude chat endpoint.

## Setup

```powershell
cd stoa/backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env      # then edit as needed

docker compose up -d db     # Postgres 17 + pgvector on localhost:5433
alembic upgrade head
python -m scripts.ingest_enchiridion       # Epictetus (51 passages)
python -m scripts.ingest_meditations       # Marcus Aurelius (487 passages)
python -m scripts.ingest_seneca_letters    # Seneca (862 passages, fetched from Wikisource)

uvicorn app.main:app --reload
```

Requires `ANTHROPIC_API_KEY` in the environment (or an `ant auth login`
profile) for `/api/chat`. `VOYAGE_API_KEY` is optional — without it retrieval
uses Postgres full-text search; with it, re-run the ingest script to embed
passages and retrieval switches to pgvector cosine similarity automatically.

## Endpoints

| Route | Description |
|---|---|
| `POST /api/chat` | `{message, conversation_id?}` → SSE stream. First a `meta` event (conversation id + source passages), then text deltas, then `done`. |
| `GET /api/conversations/{id}` | Conversation with messages |
| `GET /api/passages/{id}` | A single sourced passage |
| `GET /api/daily` | Deterministic passage of the day |
| `GET /api/health` | Liveness |

## Layout

```
app/
  main.py        FastAPI app + routes
  llm.py         Claude streaming, system prompt (cached prefix)
  retrieval.py   pgvector similarity w/ FTS fallback; Voyage embeddings
  models.py      SQLAlchemy models (passages, conversations, messages)
  schemas.py     Pydantic I/O models
  config.py      pydantic-settings
  db.py          engine/session
alembic/         migrations (0001 creates schema + pgvector extension)
scripts/
  ingest_enchiridion.py   corpus ingestion (Gutenberg #45109, idempotent)
```

## Quick test

```powershell
curl.exe -N -X POST http://127.0.0.1:8000/api/chat `
  -H "Content-Type: application/json" `
  -d '{\"message\": \"I keep worrying about things I cannot change.\"}'
```

## Not yet built (by design)

Auth (add `fastapi-users` or a hosted provider before exposing publicly),
guided exercises (dichotomy-of-control sorter, evening review), journaling.
Frontend lives in `../frontend` (React/Vite consuming the SSE stream).
