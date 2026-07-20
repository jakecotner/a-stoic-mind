# A Stoic Mind

astoicmind.com — describe a problem you're facing or a way you're trying to
grow, and reflect on it with guidance grounded in the actual writings of
Epictetus, Marcus Aurelius, and Seneca, cited passage by passage. The
conversation space is "the Stoa", after the Athenian porch where Stoicism
was first taught.

| Directory | What it is |
|---|---|
| `backend/` | FastAPI + Postgres/pgvector + Claude. Corpus, retrieval, streaming chat. See its README for setup. |
| `frontend/` | React/Vite chat UI consuming the backend's SSE stream. |

## Production build

The root `Dockerfile` builds the frontend and bakes it into the backend image,
which serves everything from one origin (API under `/api`, static app at `/`).
On start it runs `alembic upgrade head`, then binds `$PORT` (default 8000).

```sh
docker build -t astoicmind .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql+psycopg://... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  astoicmind
```

After first deploy, run the corpus ingestion once against the production DB
(from `backend/`): `ingest_enchiridion`, `ingest_meditations`,
`ingest_seneca_letters` — see `backend/README.md`.
