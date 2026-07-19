"""Ingest Seneca's Moral Letters to Lucilius (trans. Gummere) from Wikisource.

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_seneca_letters --dry-run [--letters 1-5]
    python -m scripts.ingest_seneca_letters

The 124 letters are fetched from the Wikisource parse API (one page per
letter, cached locally). Long letters are chunked into passages of a few
paragraphs; references use Gummere's canonical section numbers, e.g.
"Letters 78.1-5". Idempotent; embeds afterward if VOYAGE_API_KEY is set.
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
PAGE_TEMPLATE = "Moral letters to Lucilius/Letter {n}"
CACHE_DIR = Path(__file__).parent / "data" / "seneca_letters"
USER_AGENT = "AStoicMind-corpus-builder/0.1 (contact: jacobcotner1@gmail.com)"

AUTHOR = "Seneca"
WORK = "Moral Letters to Lucilius"
REF_WORK = "Letters"
TRANSLATOR = "Richard Mott Gummere"
LETTER_COUNT = 124

CHUNK_TARGET_CHARS = 1600  # group paragraphs up to roughly this size


def fetch_letter_html(n: int) -> str | None:
    cache = CACHE_DIR / f"letter_{n:03d}.json"
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
    else:
        resp = httpx.get(
            API_URL,
            params={
                "action": "parse",
                "page": PAGE_TEMPLATE.format(n=n),
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
        if text == "THE EPISTLES OF SENECA":
            continue
        if re.fullmatch(r"[IVXLC]+\..*", text) and text.upper() == text:
            continue  # title line, e.g. "I. ON SAVING TIME"
        if text.startswith("Greetings from Seneca"):
            continue  # salutation boilerplate on every letter
        paragraphs.append(text)
    return paragraphs


def chunk_letter(n: int, paragraphs: list[str]) -> list[tuple[str, str]]:
    """Group paragraphs into (reference, text) chunks with section ranges."""
    chunks: list[list[str]] = [[]]
    for para in paragraphs:
        current = chunks[-1]
        if current and sum(len(p) for p in current) + len(para) > CHUNK_TARGET_CHARS:
            chunks.append([para])
        else:
            current.append(para)

    result = []
    if len(chunks) == 1:
        result.append((f"{REF_WORK} {n}", "\n\n".join(chunks[0])))
        return result

    last_seen = 1
    for chunk in chunks:
        text = "\n\n".join(chunk)
        # Gummere's inline section markers, e.g. "3. Nothing, Lucilius, ..."
        marks = [int(m) for m in re.findall(r"(?:^|\s)(\d{1,3})\.\s+[A-Z“]", text)]
        marks = [m for m in marks if last_seen <= m <= last_seen + 30]
        lo = last_seen
        hi = max(marks) if marks else last_seen
        last_seen = hi
        ref = f"{REF_WORK} {n}.{lo}" if lo == hi else f"{REF_WORK} {n}.{lo}-{hi}"
        result.append((ref, text))
    return result


def parse_range(spec: str) -> list[int]:
    if "-" in spec:
        lo, hi = spec.split("-", 1)
        return list(range(int(lo), int(hi) + 1))
    return [int(spec)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--letters", default=f"1-{LETTER_COUNT}",
                        help="Letter range, e.g. 1-5 (default: all)")
    args = parser.parse_args()

    items: list[dict] = []
    missing: list[int] = []
    for n in parse_range(args.letters):
        page_html = fetch_letter_html(n)
        if page_html is None:
            missing.append(n)
            continue
        paragraphs = extract_paragraphs(page_html)
        if not paragraphs:
            missing.append(n)
            continue
        for reference, text in chunk_letter(n, paragraphs):
            items.append(
                {
                    "author": AUTHOR,
                    "work": WORK,
                    "reference": reference,
                    "translator": TRANSLATOR,
                    "text": text,
                }
            )

    print(f"Prepared {len(items)} passages; letters missing/empty: {missing or 'none'}")

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
