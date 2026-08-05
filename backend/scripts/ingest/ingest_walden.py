"""Ingest Walden (Thoreau) from Project Gutenberg — the first work of the
Transcendentalist corpus (tradition "transcendentalism").

Chunking: one passage per paragraph, referenced "Walden <chapter>.<paragraph>"
(e.g. "Walden 2.7" = chapter 2, paragraph 7). Chapter numbers follow the
book's 18 chapters in order; paragraph numbering is this script's own —
indented verse/quotation blocks attach to the prose paragraph that
introduces them rather than counting as paragraphs of their own. Like the
Musonius chunking, references would be orphaned by renumbering: don't
change the parsing rules after ingest.

Walden is an English original — translator is stored empty (no "trans."
credit anywhere it renders).

Usage (from backend/, venv active):
    .venv/Scripts/python scripts/ingest/ingest_walden.py --dry-run
    .venv/Scripts/python scripts/ingest/ingest_walden.py

Idempotent: passages already present (matched by reference) are skipped.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ingest_common import fetch_cached, paragraphs_from_lines  # noqa: E402

GUTENBERG_URL = "https://www.gutenberg.org/cache/epub/205/pg205.txt"
CACHE_PATH = Path(__file__).parent / "data" / "walden_pg205.txt"

AUTHOR = "Henry David Thoreau"
WORK = "Walden"
TRADITION = "transcendentalism"

# The 18 chapters, in reading order. Headings appear in the source as bare
# column-0 lines exactly matching these titles (the table of contents is
# indented, so it never false-matches).
CHAPTERS = [
    "Economy",
    "Where I Lived, and What I Lived For",
    "Reading",
    "Sounds",
    "Solitude",
    "Visitors",
    "The Bean-Field",
    "The Village",
    "The Ponds",
    "Baker Farm",
    "Higher Laws",
    "Brute Neighbors",
    "House-Warming",
    "Former Inhabitants and Winter Visitors",
    "Winter Animals",
    "The Pond in Winter",
    "Spring",
    "Conclusion",
]

END_HEADING = "ON THE DUTY OF CIVIL DISOBEDIENCE"


def walden_lines(raw: str) -> list[str]:
    """The lines of Walden proper: from the last bare "WALDEN" heading to
    the Civil Disobedience heading that follows it."""
    lines = raw.splitlines()
    start = max(i for i, ln in enumerate(lines) if ln == "WALDEN")
    end = next(i for i, ln in enumerate(lines) if i > start and ln == END_HEADING)
    return lines[start + 1 : end]


# Non-text blocks in the source: an image placeholder and the closing mark.
SKIP_BLOCKS = frozenset({"walden_pond_map", "THE END"})


def _paragraphs(chapter_lines: list[str]) -> list[str]:
    return paragraphs_from_lines(chapter_lines, SKIP_BLOCKS)


def parse_chapters(raw: str) -> list[tuple[int, str, list[str]]]:
    """Return (chapter_number, title, paragraphs) for the 18 chapters."""
    lines = walden_lines(raw)
    headings = [
        (i, ln) for i, ln in enumerate(lines) if ln in CHAPTERS
    ]
    if [ln for _, ln in headings] != CHAPTERS:
        found = [ln for _, ln in headings]
        raise RuntimeError(
            f"Chapter headings out of order or missing: {found}"
        )
    chapters = []
    for n, (start, title) in enumerate(headings, start=1):
        end = headings[n][0] if n < len(headings) else len(lines)
        paragraphs = _paragraphs(lines[start + 1 : end])
        if not paragraphs:
            raise RuntimeError(f"Chapter {n} ({title}): no text parsed")
        chapters.append((n, title, paragraphs))
    return chapters


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and show the chunk plan; no DB")
    args = parser.parse_args()

    chapters = parse_chapters(fetch_cached(GUTENBERG_URL, CACHE_PATH))
    total = sum(len(paras) for _, _, paras in chapters)
    print(f"{len(chapters)} chapters -> {total} passages")

    if args.dry_run:
        for n, title, paras in chapters:
            sizes = [len(p) for p in paras]
            print(
                f"  {n:>2}. {title:<40} {len(paras):>3} paragraphs "
                f"({min(sizes)}-{max(sizes)} chars, median "
                f"{sorted(sizes)[len(sizes) // 2]})"
            )
        return

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import Passage

    inserted = skipped = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Passage.reference)))
        position = 0
        for n, _title, paras in chapters:
            for i, text in enumerate(paras, start=1):
                position += 1
                reference = f"{WORK} {n}.{i}"
                if reference in existing:
                    skipped += 1
                    continue
                db.add(
                    Passage(
                        author=AUTHOR,
                        work=WORK,
                        reference=reference,
                        position=position,
                        translator="",
                        text=text,
                        tradition=TRADITION,
                    )
                )
                inserted += 1
        db.commit()
    print(f"Inserted {inserted} passages ({skipped} already present)")


if __name__ == "__main__":
    main()
