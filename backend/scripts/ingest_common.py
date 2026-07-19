"""Shared helpers for corpus ingestion scripts."""

from sqlalchemy import select
from sqlalchemy.orm import Session


def insert_passages(db: Session, items: list[dict]) -> tuple[int, int]:
    """Insert passages, skipping references already present.

    Each item: {author, work, reference, translator, text}.
    Returns (inserted, skipped).
    """
    from app.models import Passage

    existing = set(db.scalars(select(Passage.reference)))
    inserted = 0
    for item in items:
        if item["reference"] in existing:
            continue
        db.add(Passage(**item))
        inserted += 1
    db.commit()
    return inserted, len(items) - inserted


def embed_missing_if_configured(db: Session) -> None:
    from app.config import get_settings
    from app.models import Passage
    from app.retrieval import embed_texts

    if not get_settings().voyage_api_key:
        print("VOYAGE_API_KEY not set - skipping embeddings "
              "(retrieval will use full-text search)")
        return

    pending = list(db.scalars(select(Passage).where(Passage.embedding.is_(None))))
    if not pending:
        print("All passages already embedded")
        return
    print(f"Embedding {len(pending)} passages ...")
    batch_size = 64
    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        vectors = embed_texts([p.text for p in batch], input_type="document")
        for passage, vector in zip(batch, vectors):
            passage.embedding = vector
        db.commit()
    print("Embeddings complete")
