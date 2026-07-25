"""Ingest the Enchiridion (Epictetus, trans. Higginson) from Project Gutenberg.

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_enchiridion --dry-run   # parse and preview only
    python -m scripts.ingest_enchiridion             # insert into the database

Idempotent: passages already present (matched by reference) are skipped.
If VOYAGE_API_KEY is configured, missing embeddings are generated afterward.
"""

import argparse
import re
import sys
from pathlib import Path

import httpx

GUTENBERG_URL = "https://www.gutenberg.org/cache/epub/45109/pg45109.txt"
CACHE_PATH = Path(__file__).parent / "data" / "enchiridion_pg45109.txt"

AUTHOR = "Epictetus"
WORK = "Enchiridion"
TRANSLATOR = "Thomas Wentworth Higginson"

ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman_to_int(s: str) -> int:
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN_VALUES[ch]
        if i + 1 < len(s) and ROMAN_VALUES[s[i + 1]] > v:
            total -= v
        else:
            total += v
    return total


def fetch_text() -> str:
    if CACHE_PATH.exists():
        return CACHE_PATH.read_text(encoding="utf-8")
    print(f"Downloading {GUTENBERG_URL} ...")
    resp = httpx.get(GUTENBERG_URL, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(resp.text, encoding="utf-8")
    return resp.text


def parse_chapters(raw: str) -> list[tuple[int, str]]:
    """Return (chapter_number, text) pairs."""
    lines = raw.splitlines()

    # The Enchiridion proper is the last "THE ENCHIRIDION" heading (the book
    # also contains an introduction); it ends at the "Footnotes" heading.
    start = max(i for i, ln in enumerate(lines) if ln.strip() == "THE ENCHIRIDION")
    end = next(
        i for i, ln in enumerate(lines) if i > start and ln.strip() == "Footnotes"
    )
    body = lines[start + 1 : end]

    chapters: list[tuple[int, list[str]]] = []
    current: list[str] | None = None
    for line in body:
        stripped = line.strip()
        # A heading may carry a footnote marker, e.g. "XXIX[2]"
        heading = re.fullmatch(r"([IVXLC]+)(?:\[\d+\])?", stripped)
        if heading and line.startswith(" "):
            chapters.append((roman_to_int(heading.group(1)), []))
            current = chapters[-1][1]
        elif current is not None:
            current.append(line)

    result = []
    for number, chapter_lines in chapters:
        text = _clean_text(chapter_lines)
        if text:
            result.append((number, text))
    return result


def _clean_text(chapter_lines: list[str]) -> str:
    text = "\n".join(chapter_lines)
    text = re.sub(r"\[\d+\]", "", text)  # footnote markers
    paragraphs = []
    for block in re.split(r"\n\s*\n", text):
        para = " ".join(ln.strip() for ln in block.splitlines() if ln.strip())
        if para:
            paragraphs.append(para)
    return "\n\n".join(paragraphs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Parse and preview only")
    args = parser.parse_args()

    chapters = parse_chapters(fetch_text())
    print(f"Parsed {len(chapters)} chapters "
          f"(numbers {chapters[0][0]}..{chapters[-1][0]})")

    if args.dry_run:
        for number, text in chapters[:3]:
            print(f"\n--- {WORK} {number} ---\n{text[:400]}")
        return

    from sqlalchemy import select

    from app.config import get_settings
    from app.db import SessionLocal
    from app.models import Passage

    inserted = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Passage.reference)))
        for number, text in chapters:
            reference = f"{WORK} {number}"
            if reference in existing:
                continue
            db.add(
                Passage(
                    author=AUTHOR,
                    work=WORK,
                    reference=reference,
                    translator=TRANSLATOR,
                    text=text,
                )
            )
            inserted += 1
        db.commit()
        print(f"Inserted {inserted} passages ({len(existing)} already present)")

        if get_settings().voyage_api_key:
            _embed_missing(db)
        else:
            print("VOYAGE_API_KEY not set - skipping embeddings "
                  "(retrieval will use full-text search)")


def _embed_missing(db) -> None:
    from sqlalchemy import select

    from app.models import Passage
    from app.retrieval import embed_texts

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


if __name__ == "__main__":
    sys.exit(main())
