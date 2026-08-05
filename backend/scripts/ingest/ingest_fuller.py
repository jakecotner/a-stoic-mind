"""Ingest Margaret Fuller's Woman in the Nineteenth Century (PG 8642) for
the Transcendentalist corpus.

The Gutenberg ebook is the 1855 posthumous collection ("... and Kindred
Papers"); only the title essay is ingested — its text runs from the
"WOMAN IN THE NINETEENTH CENTURY." heading to "PART II." (the
miscellanies). Chunking: one passage per paragraph, referenced
"Woman in the Nineteenth Century <paragraph>". Paragraph numbering is this
script's own; frozen after ingest.

Source quirks handled here:
- "*  *  *  *  *" separator rows are dropped.
- "--" em-dashes normalized to "—".
- "[Footnote: Name]" attributions become "— Name" (they credit the author
  of a quotation inline; dropping them would orphan the quotes).
- Short ALL-CAPS caption lines over quoted documents ("REPLY OF MR.
  ADAMS.") attach as a heading line to the paragraph they introduce.

English original — translator is stored empty.

Usage (from backend/, venv active):
    .venv/Scripts/python scripts/ingest/ingest_fuller.py --dry-run
    .venv/Scripts/python scripts/ingest/ingest_fuller.py

Idempotent: passages already present (matched by reference) are skipped.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ingest_common import fetch_cached, paragraphs_from_lines  # noqa: E402

URL = "https://www.gutenberg.org/cache/epub/8642/pg8642.txt"
CACHE = Path(__file__).parent / "data" / "fuller_pg8642.txt"

AUTHOR = "Margaret Fuller"
WORK = "Woman in the Nineteenth Century"
TRADITION = "transcendentalism"

_SEPARATOR = re.compile(r"(\*\s*)+")
_CAPTION = re.compile(r"[A-Z][A-Z .,;:'—-]{2,58}\.?")


def _normalize(text: str) -> str:
    text = text.replace("--", "—")
    return re.sub(r"\s*\[Footnote: ([^\]]+)\]", r" — \1", text)


def parse_paragraphs() -> list[str]:
    lines = fetch_cached(URL, CACHE).splitlines()
    start = max(
        i for i, ln in enumerate(lines)
        if ln == "WOMAN IN THE NINETEENTH CENTURY."
    )
    end = next(i for i, ln in enumerate(lines) if i > start and ln == "PART II.")
    # Separator rows are indented, so they'd read as verse — drop the lines.
    body = [
        ln for ln in lines[start + 1 : end]
        if not _SEPARATOR.fullmatch(ln.strip())
    ]
    raw = paragraphs_from_lines(body)

    paragraphs: list[str] = []
    caption: str | None = None
    for p in (_normalize(p) for p in raw):
        if _SEPARATOR.fullmatch(p):
            continue
        if _CAPTION.fullmatch(p):
            caption = p if caption is None else f"{caption}\n{p}"
            continue
        if caption is not None:
            p = f"{caption}\n\n{p}"
            caption = None
        paragraphs.append(p)
    return paragraphs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and show the chunk plan; no DB")
    args = parser.parse_args()

    paras = parse_paragraphs()
    sizes = sorted(len(p) for p in paras)
    print(
        f"{WORK}: {len(paras)} paragraphs "
        f"({sizes[0]}-{sizes[-1]} chars, median {sizes[len(sizes) // 2]})"
    )
    if args.dry_run:
        print(f"\n--- first ---\n{paras[0][:280]}")
        print(f"\n--- last ---\n{paras[-1][:280]}")
        return

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import Passage

    inserted = skipped = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Passage.reference)))
        for i, text in enumerate(paras, start=1):
            reference = f"{WORK} {i}"
            if reference in existing:
                skipped += 1
                continue
            db.add(
                Passage(
                    author=AUTHOR,
                    work=WORK,
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
