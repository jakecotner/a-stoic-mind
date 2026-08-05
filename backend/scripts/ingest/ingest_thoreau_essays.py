"""Ingest Thoreau's shorter essays for the Transcendentalist corpus:

- Civil Disobedience   — from the Walden ebook (PG 205), which pairs them
- Walking              — PG 1022
- Life Without Principle — from "A Yankee in Canada, with Anti-Slavery and
  Reform Papers" (PG 70123), which prints it with inline footnote blocks
  (skipped) and [N] markers (stripped by the shared cleaner)

Chunking: one passage per paragraph, referenced "<Work> <paragraph>"
(e.g. "Walking 7") — these essays have no internal chapters, so the
reader shows each as a single full text. Paragraph numbering is this
script's own; like Walden, references would be orphaned by renumbering,
so the parsing rules are frozen after ingest.

English originals — translator is stored empty.

Usage (from backend/, venv active):
    .venv/Scripts/python scripts/ingest/ingest_thoreau_essays.py --dry-run
    .venv/Scripts/python scripts/ingest/ingest_thoreau_essays.py

Idempotent: passages already present (matched by reference) are skipped.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ingest_common import fetch_cached, paragraphs_from_lines  # noqa: E402

DATA = Path(__file__).parent / "data"

AUTHOR = "Henry David Thoreau"
TRADITION = "transcendentalism"

WALDEN_URL = "https://www.gutenberg.org/cache/epub/205/pg205.txt"
WALKING_URL = "https://www.gutenberg.org/cache/epub/1022/pg1022.txt"
YANKEE_URL = "https://www.gutenberg.org/cache/epub/70123/pg70123.txt"

END_MARK = "*** END OF THE PROJECT GUTENBERG"


def _region(lines: list[str], start: int, end: int) -> list[str]:
    return lines[start:end]


def civil_disobedience() -> list[str]:
    """From the last "ON THE DUTY OF CIVIL DISOBEDIENCE" heading to the
    ebook end marker."""
    lines = fetch_cached(WALDEN_URL, DATA / "walden_pg205.txt").splitlines()
    start = max(
        i for i, ln in enumerate(lines)
        if ln == "ON THE DUTY OF CIVIL DISOBEDIENCE"
    )
    end = next(i for i, ln in enumerate(lines) if ln.startswith(END_MARK))
    return paragraphs_from_lines(_region(lines, start + 1, end))


def walking() -> list[str]:
    """From the bare "WALKING" heading to the ebook end marker."""
    lines = fetch_cached(WALKING_URL, DATA / "walking_pg1022.txt").splitlines()
    start = max(i for i, ln in enumerate(lines) if ln == "WALKING")
    end = next(i for i, ln in enumerate(lines) if ln.startswith(END_MARK))
    return paragraphs_from_lines(
        _region(lines, start + 1, end),
        frozenset({"by Henry David Thoreau"}),
    )


def life_without_principle() -> list[str]:
    """The essay's span inside the Yankee collection: from its centered
    heading to the next essay's. "Footnote N:" blocks (a label line plus
    its indented body) are editorial apparatus, not text — dropped."""
    lines = fetch_cached(YANKEE_URL, DATA / "yankee_pg70123.txt").splitlines()
    start = next(
        i for i, ln in enumerate(lines)
        if ln.strip().startswith("LIFE WITHOUT PRINCIPLE.")
    )
    end = next(
        i for i, ln in enumerate(lines)
        if i > start and ln.strip().startswith("WENDELL PHILLIPS")
    )
    kept: list[str] = []
    in_footnote = False
    for ln in _region(lines, start + 1, end):
        if re.fullmatch(r"Footnote \d+:", ln.strip()):
            in_footnote = True
            continue
        if in_footnote:
            # The footnote body is indented; the first flush-left text line
            # after it resumes the essay.
            if ln.strip() and not ln.startswith(" "):
                in_footnote = False
            else:
                continue
        kept.append(ln)
    return paragraphs_from_lines(kept)


ESSAYS = [
    ("Civil Disobedience", civil_disobedience),
    ("Walking", walking),
    ("Life Without Principle", life_without_principle),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and show the chunk plan; no DB")
    args = parser.parse_args()

    parsed = [(work, fn()) for work, fn in ESSAYS]
    for work, paras in parsed:
        sizes = sorted(len(p) for p in paras)
        print(
            f"{work}: {len(paras)} paragraphs "
            f"({sizes[0]}-{sizes[-1]} chars, median {sizes[len(sizes) // 2]})"
        )

    if args.dry_run:
        for work, paras in parsed:
            print(f"\n--- {work} 1 ---\n{paras[0][:300]}")
            print(f"\n--- {work} {len(paras)} ---\n{paras[-1][:300]}")
        return

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import Passage

    inserted = skipped = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Passage.reference)))
        for work, paras in parsed:
            for i, text in enumerate(paras, start=1):
                reference = f"{work} {i}"
                if reference in existing:
                    skipped += 1
                    continue
                db.add(
                    Passage(
                        author=AUTHOR,
                        work=work,
                        reference=reference,
                        position=i,
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
