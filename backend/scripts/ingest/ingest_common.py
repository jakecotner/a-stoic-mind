"""Shared helpers for corpus ingestion scripts."""

import re
from pathlib import Path

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session


def clean_passage_text(text: str) -> str:
    """Strip Gutenberg markup: _emphasis_ pairs and [N] footnote markers."""
    text = re.sub(r"_(.+?)_", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"\[\d+\]", "", text)
    return text.strip()


def _is_verse(block: list[str]) -> bool:
    return all(ln.startswith((" ", "\t")) for ln in block if ln.strip())


def paragraphs_from_lines(
    lines: list[str], skip_blocks: frozenset[str] = frozenset()
) -> list[str]:
    """Paragraphs from a Gutenberg plain-text region: blank-line-separated
    blocks; prose blocks unwrap to one line, verse/quotation blocks keep
    their line breaks (dedented) and attach to the paragraph that introduces
    them. A prose block starting lowercase is the same paragraph resuming
    after an inline verse — it merges back too. Blocks whose raw text is in
    skip_blocks (image placeholders, closing marks) are dropped."""
    blocks: list[list[str]] = []
    current: list[str] = []
    for ln in lines:
        if ln.strip():
            current.append(ln)
        elif current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)

    paragraphs: list[str] = []
    for block in blocks:
        raw = " ".join(ln.strip() for ln in block)
        if raw in skip_blocks or re.fullmatch(r"-{10,}", raw):
            continue
        if _is_verse(block):
            indent = min(len(ln) - len(ln.lstrip()) for ln in block if ln.strip())
            text = clean_passage_text(
                "\n".join(ln[indent:].rstrip() for ln in block)
            )
        else:
            text = clean_passage_text(" ".join(ln.strip() for ln in block))
            # A new paragraph — unless it starts lowercase (the previous one
            # resuming after inline verse) or the previous one ends with an
            # em-dash lead-in (it introduces this block: a quote, a rhyme).
            if not (
                (text and text[0].islower())
                or (paragraphs and paragraphs[-1].rstrip().endswith("—"))
            ):
                paragraphs.append(text)
                continue
        # Continuation of the open paragraph.
        if paragraphs:
            paragraphs[-1] += "\n\n" + text
        else:
            paragraphs.append(text)
    return [p for p in paragraphs if p]


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
