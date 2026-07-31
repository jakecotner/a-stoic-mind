# FastAPI image (Railway service: backend). Build context is backend/.
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Triggers the production misconfiguration guards in app/main.py.
ENV APP_ENV=production
EXPOSE 8000

# Run migrations, then start. PORT is injected by most PaaS hosts.
# python -m keeps the workdir on sys.path so alembic/env.py can import `app`.
# Two workers double the sync-endpoint threadpool and survive one worker
# dying; in-process state (anon rate windows) is per-worker, which just
# means slightly looser caps — acceptable.
CMD ["sh", "-c", "python -m alembic upgrade head && python -m uvicorn app.main:app --host :: --port ${PORT:-8000} --workers 2"]
