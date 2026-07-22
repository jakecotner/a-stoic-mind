"""Ingest Epictetus' Discourses (trans. George Long) from Wikisource.

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_discourses --dry-run [--book 1]
    python -m scripts.ingest_discourses

The 95 chapters (Books 1-4) are fetched from the Wikisource parse API (one
page per chapter, cached locally). Long chapters are chunked into passages of
a few paragraphs. References are "Discourses 1.1" for a whole chapter and
"Discourses 3.24.2" for chunk 2 of a split chapter — the trailing index is a
chunk number, not a Schenkl section (Long's 1877 text carries no section
marks). Idempotent; embeds afterward if VOYAGE_API_KEY is set.
"""

import argparse
import html as html_lib
import json
import re
import sys
import time
from pathlib import Path

import httpx

API_URL = "https://en.wikisource.org/w/api.php"
PAGE_TEMPLATE = (
    "The Discourses of Epictetus; with the Encheiridion and Fragments"
    "/Book {book}/Chapter {chapter}"
)
CACHE_DIR = Path(__file__).parent / "data" / "discourses"
USER_AGENT = "AStoicMind-corpus-builder/0.1 (contact: jacobcotner1@gmail.com)"

AUTHOR = "Epictetus"
WORK = "Discourses"
REF_WORK = "Discourses"
TRANSLATOR = "George Long"
CHAPTERS_PER_BOOK = {1: 30, 2: 26, 3: 26, 4: 13}

CHUNK_TARGET_CHARS = 1600  # group paragraphs up to roughly this size
CHUNK_MIN_CHARS = 400  # merge smaller chunks into a neighbour


def fetch_chapter_html(book: int, chapter: int) -> str | None:
    cache = CACHE_DIR / f"book{book}_chapter{chapter:02d}.json"
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
    else:
        resp = httpx.get(
            API_URL,
            params={
                "action": "parse",
                "page": PAGE_TEMPLATE.format(book=book, chapter=chapter),
                "prop": "text",
                "format": "json",
                "formatversion": "2",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=60,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data), encoding="utf-8")
        time.sleep(0.3)  # politeness delay for live fetches
    if "parse" not in data:
        return None
    return data["parse"]["text"]


def extract_paragraphs(page_html: str) -> list[str]:
    page_html = re.sub(r"<style.*?</style>", "", page_html, flags=re.S)
    page_html = re.sub(r'<sup class="reference".*?</sup>', "", page_html, flags=re.S)
    page_html = re.sub(r'<span class="pagenum[^"]*".*?</span>', "", page_html, flags=re.S)
    # Centered blocks hold the "BOOK I." / "CHAPTER I." headings and the
    # small-caps chapter title line
    page_html = re.sub(r'<div class="wst-center[^"]*">.*?</div>', "", page_html, flags=re.S)
    # Drop the footnotes list at the bottom
    page_html = re.sub(r'<ol class="references".*', "", page_html, flags=re.S)

    paragraphs = []
    for raw in re.findall(r"<p[^>]*>(.*?)</p>", page_html, flags=re.S):
        text = re.sub(r"<[^>]+>", " ", raw)
        text = html_lib.unescape(text)
        text = re.sub(r"\[\s*\d+\s*\]", "", text)  # residual footnote markers
        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r" ([,.;:!?])", r"\1", text)  # spaces left by tag stripping
        if not text:
            continue
        if text.startswith("Layout "):
            continue  # dynamic-layout overrider span
        if re.fullmatch(r"(BOOK|CHAPTER) [IVXLC]+\.?", text):
            continue  # heading that escaped the wst-center strip
        paragraphs.append(text)
    return paragraphs


def chunk_chapter(book: int, chapter: int, paragraphs: list[str]) -> list[tuple[str, str]]:
    """Group paragraphs into (reference, text) chunks."""
    chunks: list[list[str]] = [[]]
    for para in paragraphs:
        current = chunks[-1]
        if current and sum(len(p) for p in current) + len(para) > CHUNK_TARGET_CHARS:
            chunks.append([para])
        else:
            current.append(para)

    # A chunk stays tiny when the paragraph after it was huge (or the chapter
    # ended); fold such chunks into the preceding one rather than publishing
    # a one-line passage.
    merged: list[list[str]] = []
    for chunk in chunks:
        if merged and sum(len(p) for p in chunk) < CHUNK_MIN_CHARS:
            merged[-1].extend(chunk)
        else:
            merged.append(chunk)
    chunks = merged

    if len(chunks) == 1:
        return [(f"{REF_WORK} {book}.{chapter}", "\n\n".join(chunks[0]))]
    return [
        (f"{REF_WORK} {book}.{chapter}.{i}", "\n\n".join(chunk))
        for i, chunk in enumerate(chunks, start=1)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--book", type=int, choices=sorted(CHAPTERS_PER_BOOK),
                        help="Restrict to one book (default: all four)")
    args = parser.parse_args()

    books = [args.book] if args.book else sorted(CHAPTERS_PER_BOOK)

    items: list[dict] = []
    missing: list[str] = []
    for book in books:
        for chapter in range(1, CHAPTERS_PER_BOOK[book] + 1):
            page_html = fetch_chapter_html(book, chapter)
            paragraphs = extract_paragraphs(page_html) if page_html else []
            if not paragraphs:
                missing.append(f"{book}.{chapter}")
                continue
            if paragraphs[0][0].islower():
                # A leaked title line would corrupt the first passage; the
                # body proper always opens with a capital.
                print(f"  WARNING {book}.{chapter}: first paragraph starts "
                      f"lowercase (leaked title?): {paragraphs[0][:60]!r}")
            for reference, text in chunk_chapter(book, chapter, paragraphs):
                items.append(
                    {
                        "author": AUTHOR,
                        "work": WORK,
                        "reference": reference,
                        "translator": TRANSLATOR,
                        "text": text,
                    }
                )

    print(f"Prepared {len(items)} passages; chapters missing/empty: {missing or 'none'}")

    if args.dry_run:
        for item in items[:3]:
            print(f"\n--- {item['reference']} ---\n{item['text'][:350]}")
        return

    from app.db import SessionLocal
    from scripts.ingest_common import embed_missing_if_configured, insert_passages

    with SessionLocal() as db:
        inserted, skipped = insert_passages(db, items)
        print(f"Inserted {inserted} passages ({skipped} already present)")
        embed_missing_if_configured(db)


if __name__ == "__main__":
    sys.exit(main())
