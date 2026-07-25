"""Shared helpers for corpus ingestion scripts."""

from pathlib import Path

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


def fetch_cached(url: str, cache_path: Path) -> str:
    """Download url once, caching the response body at cache_path."""
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    print(f"Downloading {url} ...")
    resp = httpx.get(url, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(resp.text, encoding="utf-8")
    return resp.text


def apply_originals(
    db: Session,
    work: str,
    chapters: dict[str, str],
    language: str,
    source: str,
    force: bool = False,
) -> None:
    """Attach original-language texts to a work's passages by reference.

    Cached LLM translations of updated passages are deleted — they were
    translated from the English alone and are superseded by from-the-original
    translations. Reports unmatched references on both sides."""
    from app.models import Passage, PassageTranslation

    passages = list(db.scalars(select(Passage).where(Passage.work == work)))
    by_ref = {p.reference: p for p in passages}
    updated: list[int] = []
    skipped = 0
    for ref, original in chapters.items():
        passage = by_ref.get(ref)
        if passage is None:
            print(f"  NO ENGLISH PASSAGE for {ref}")
            continue
        if passage.original_text is not None and not force:
            skipped += 1
            continue
        passage.original_text = original
        passage.original_language = language
        passage.original_source = source
        updated.append(passage.id)
    unmatched = [p.reference for p in passages if p.reference not in chapters]
    for ref in unmatched:
        print(f"  NO ORIGINAL for {ref}")

    stale = 0
    if updated:
        stale = db.execute(
            delete(PassageTranslation).where(
                PassageTranslation.passage_id.in_(updated)
            )
        ).rowcount
    db.commit()
    print(
        f"Set originals on {len(updated)} passages "
        f"({skipped} already present, {len(unmatched)} unmatched); "
        f"deleted {stale} stale cached translations"
    )


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
