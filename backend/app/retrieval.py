"""Passage retrieval.

With a VOYAGE_API_KEY configured, retrieval embeds the query (voyage-3.5)
and runs cosine-similarity search over pgvector. Without one, it falls back
to Postgres full-text search with OR semantics — cruder, but keeps the app
fully runnable with no third-party keys besides Anthropic.
"""

import re

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Passage

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-3.5"


def embed_texts(texts: list[str], input_type: str) -> list[list[float]]:
    """Embed texts with Voyage. input_type is "query" or "document"."""
    settings = get_settings()
    if not settings.voyage_api_key:
        raise RuntimeError("VOYAGE_API_KEY is not configured")
    resp = httpx.post(
        VOYAGE_URL,
        headers={"Authorization": f"Bearer {settings.voyage_api_key}"},
        json={"input": texts, "model": VOYAGE_MODEL, "input_type": input_type},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    return [item["embedding"] for item in sorted(data, key=lambda d: d["index"])]


def search_passages(db: Session, query: str, k: int | None = None) -> list[Passage]:
    settings = get_settings()
    k = k or settings.retrieval_top_k

    if settings.voyage_api_key:
        has_embeddings = db.scalar(
            select(func.count()).select_from(Passage).where(Passage.embedding.is_not(None))
        )
        if has_embeddings:
            qvec = embed_texts([query], input_type="query")[0]
            stmt = (
                select(Passage)
                .where(Passage.embedding.is_not(None))
                .order_by(Passage.embedding.cosine_distance(qvec))
                .limit(k)
            )
            return list(db.scalars(stmt))

    return _fts_search(db, query, k)


def _fts_search(db: Session, query: str, k: int) -> list[Passage]:
    # OR the words together: a conversational query ("I'm anxious about my
    # job") would match nothing under websearch AND semantics.
    words = re.findall(r"[a-zA-Z]{3,}", query)
    if not words:
        return []
    ts_query = func.websearch_to_tsquery("english", " OR ".join(words))
    ts_vector = func.to_tsvector("english", Passage.text)
    stmt = (
        select(Passage)
        .where(ts_vector.op("@@")(ts_query))
        .order_by(func.ts_rank(ts_vector, ts_query).desc())
        .limit(k)
    )
    return list(db.scalars(stmt))
