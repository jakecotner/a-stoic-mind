# Production image: FastAPI backend serving the built frontend at "/".
# Build context is the repo root (stoa/).

# ---- Stage 1: build the frontend ----
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend + static assets ----
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend /build/dist ./static

ENV STATIC_DIR=/app/static
EXPOSE 8000

# Run migrations, then start. PORT is injected by most PaaS hosts.
# python -m keeps the workdir on sys.path so alembic/env.py can import `app`
CMD ["sh", "-c", "python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
