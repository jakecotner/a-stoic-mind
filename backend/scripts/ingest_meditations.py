"""Ingest the Meditations (Marcus Aurelius, trans. George Long) from Gutenberg #15877.

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_meditations --dry-run
    python -m scripts.ingest_meditations

Passages are individual sections cited as "Meditations {book}.{section}".
Idempotent; embeds afterward if VOYAGE_API_KEY is configured.
"""

import argparse
import re
import sys
from pathlib import Path

import httpx

GUTENBERG_URL = "https://www.gutenberg.org/cache/epub/15877/pg15877.txt"
CACHE_PATH = Path(__file__).parent / "data" / "meditations_pg15877.txt"

AUTHOR = "Marcus Aurelius"
WORK = "Meditations"
TRANSLATOR = "George Long"

BOOK_RE = re.compile(r"^[IVX]+\.$")
SECTION_RE = re.compile(r"^(\d+)\.\s+")
ROMAN = {"I": 1, "V": 5, "X": 10}


def roman_to_int(s: str) -> int:
    total = 0
    for i, ch in enumerate(s):
        v = ROMAN[ch]
        total += -v if i + 1 < len(s) and ROMAN[s[i + 1]] > v else v
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


def parse_sections(raw: str) -> list[tuple[int, int, str]]:
    """Return (book, section, text) triples."""
    lines = raw.splitlines()
    start = lines.index("THE THOUGHTS")
    end = next(i for i, ln in enumerate(lines) if ln.strip() == "INDEXES.")

    # Split the region into books at standalone Roman-numeral lines.
    books: list[list[str]] = []
    for line in lines[start:end]:
        if BOOK_RE.fullmatch(line.strip()) and not line.startswith(" "):
            books.append([])
        elif books:
            books[-1].append(line)
    if len(books) != 12:
        raise RuntimeError(f"Expected 12 books, found {len(books)}")

    result = []
    for book_num, book_lines in enumerate(books, start=1):
        body = _strip_footnotes(book_lines)
        for section_num, text in _split_numbered_sections(body):
            text = _clean(text)
            if text:
                result.append((book_num, section_num, text))
    return result


def _strip_footnotes(lines: list[str]) -> list[str]:
    """Drop indented translator-footnote blocks (start like '    [A] ...')."""
    kept: list[str] = []
    in_footnote = False
    for line in lines:
        if re.match(r"^\s{3,}\[[A-Z0-9]+\]", line):
            in_footnote = True
            continue
        if in_footnote:
            if line.strip() == "" or line.startswith("   "):
                continue
            in_footnote = False
        kept.append(line)
    return kept


def _split_numbered_sections(lines: list[str]) -> list[tuple[int, str]]:
    """Split a book's lines into sections; the leading unnumbered text is §1."""
    sections: list[tuple[int, list[str]]] = [(1, [])]
    for line in lines:
        m = SECTION_RE.match(line)
        if m and not line.startswith(" "):
            sections.append((int(m.group(1)), [SECTION_RE.sub("", line, count=1)]))
        else:
            sections[-1][1].append(line)
    return [(num, "\n".join(ls)) for num, ls in sections]


def _clean(text: str) -> str:
    text = re.sub(r"\[[A-Z]\]|\[\d+\]", "", text)  # footnote markers
    paragraphs = []
    for block in re.split(r"\n\s*\n", text):
        para = " ".join(ln.strip() for ln in block.splitlines() if ln.strip())
        if para:
            paragraphs.append(para)
    return "\n\n".join(paragraphs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sections = parse_sections(fetch_text())
    per_book: dict[int, int] = {}
    for book, _, _ in sections:
        per_book[book] = per_book.get(book, 0) + 1
    print(f"Parsed {len(sections)} sections across {len(per_book)} books")
    print("  per book:", per_book)

    if args.dry_run:
        for book, section, text in sections[:2] + sections[-1:]:
            print(f"\n--- {WORK} {book}.{section} ---\n{text[:350]}")
        return

    from app.db import SessionLocal
    from scripts.ingest_common import embed_missing_if_configured, insert_passages

    items = [
        {
            "author": AUTHOR,
            "work": WORK,
            "reference": f"{WORK} {book}.{section}",
            "translator": TRANSLATOR,
            "text": text,
        }
        for book, section, text in sections
    ]
    with SessionLocal() as db:
        inserted, skipped = insert_passages(db, items)
        print(f"Inserted {inserted} passages ({skipped} already present)")
        embed_missing_if_configured(db)


if __name__ == "__main__":
    sys.exit(main())
