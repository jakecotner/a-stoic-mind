"""Ingest Seneca's dialogues, consolations, Of Clemency, and On Benefits
from Wikisource (trans. Aubrey Stewart, except Basore's Shortness of Life).

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_seneca_dialogues --dry-run [--work "Of Anger"]
    python -m scripts.ingest_seneca_dialogues

Twelve works. Wikisource presents them three ways — a whole work (or one
book of it) on a single page with per-chapter <h2>/<h3> headings, or one
chapter per subpage — the manifest below records which. References are
"Of Leisure 3" / "Of Anger 2.14" (book.chapter), with a trailing chunk
index ("Of Anger 2.14.2") when a chapter is split; chunk indices are not
canonical section numbers. Idempotent; embeds if VOYAGE_API_KEY is set.
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
CACHE_DIR = Path(__file__).parent / "data" / "seneca_dialogues"
USER_AGENT = "AStoicMind-corpus-builder/0.1 (contact: jacobcotner1@gmail.com)"

AUTHOR = "Seneca"
STEWART = "Aubrey Stewart"
BASORE = "John W. Basore"

CHUNK_TARGET_CHARS = 1600  # group paragraphs up to roughly this size
CHUNK_MIN_CHARS = 400  # merge smaller chunks into a neighbour

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


def int_to_roman(n: int) -> str:
    out = []
    for value, numeral in [(100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
                           (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while n >= value:
            out.append(numeral)
            n -= value
    return "".join(out)


# Each work: (work, translator, expected_chapters_per_book, pages), where
# pages is a list of (page_title, book, chapter). book=None → flat work
# (references carry the chapter number only). chapter=None → the page holds
# many chapters split by headings; otherwise the whole page is that chapter.
# expected_chapters_per_book maps book (or None for flat) → chapter count,
# checked after parsing to catch heading drift.
WORKS = [
    ("Of Providence", STEWART, {None: 6},
     [("Of Providence", None, None)]),
    ("On the Firmness of the Wise Man", STEWART, {None: 19},
     [("On the Firmness of the Wise Man", None, None)]),
    ("Of Anger", STEWART, {1: 21, 2: 36, 3: 43},
     [(f"Of Anger/Book {int_to_roman(b)}", b, None) for b in (1, 2, 3)]),
    ("Of Consolation: To Marcia", STEWART, {None: 26},
     [("Of Consolation: To Marcia", None, None)]),
    ("Of a Happy Life", STEWART, {None: 28},
     [(f"Of a Happy Life/Book {int_to_roman(c)}", None, c) for c in range(1, 29)]),
    ("Of Leisure", STEWART, {None: 8},
     [("Of Leisure", None, None)]),
    ("Of Peace of Mind", STEWART, {None: 17},
     [("Of Peace of Mind", None, None)]),
    ("On the Shortness of Life", BASORE, {None: 20},
     [(f"On the shortness of life/Chapter {int_to_roman(c)}", None, c)
      for c in range(1, 21)]),
    ("Of Consolation: To Polybius", STEWART, {None: 18},
     [("Of Consolation: To Polybius", None, None)]),
    ("Of Consolation: To Helvia", STEWART, {None: 20},
     [("Of Consolation: To Helvia", None, None)]),
    ("Of Clemency", STEWART, {1: 26, 2: 7},
     [(f"Of Clemency/Book {int_to_roman(b)}", b, None) for b in (1, 2)]),
    ("On Benefits", STEWART, {},  # per-book counts vary; contiguity check only
     [(f"On Benefits/Book {int_to_roman(b)}", b, None) for b in range(1, 8)]),
]


def fetch_page_html(page: str) -> str | None:
    cache = CACHE_DIR / (re.sub(r"[^A-Za-z0-9]+", "_", page).strip("_") + ".json")
    if cache.exists():
        data = json.loads(cache.read_text(encoding="utf-8"))
    else:
        resp = httpx.get(
            API_URL,
            params={
                "action": "parse",
                "page": page,
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


def _fix_drop_initials(page_html: str) -> str:
    """Rejoin illuminated first letters: <span class="dropinitial ..."><span
    ...>Y</span>...</span>OU → "You" (the caps run is typographic)."""
    def repl(m: re.Match) -> str:
        initial, rest = m.group(1), m.group(2)
        return initial + (rest.lower() if rest.isupper() else rest)

    return re.sub(
        r'<span class="dropinitial[^"]*">(?:\s*<span[^>]*>)*\s*([^<]*?)\s*'
        r"(?:</span>\s*)+([A-Za-z]*)",
        repl,
        page_html,
    )


def _clean_html(page_html: str) -> str:
    page_html = re.sub(r"<style.*?</style>", "", page_html, flags=re.S)
    page_html = _fix_drop_initials(page_html)
    page_html = re.sub(r'<sup class="reference".*?</sup>', "", page_html, flags=re.S)
    page_html = re.sub(r'<span class="pagenum[^"]*".*?</span>', "", page_html, flags=re.S)
    # Centered blocks hold title/author mastheads
    page_html = re.sub(r'<div class="wst-center[^"]*">.*?</div>', "", page_html, flags=re.S)
    page_html = re.sub(r'<ol class="references".*', "", page_html, flags=re.S)
    return page_html


def _paragraphs(fragment: str) -> list[str]:
    paragraphs = []
    for raw in re.findall(r"<p[^>]*>(.*?)</p>", fragment, flags=re.S):
        text = re.sub(r"<[^>]+>", " ", raw)
        text = html_lib.unescape(text)
        text = re.sub(r"\[\s*\d+\s*\]", "", text)  # residual footnote markers
        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r" ([,.;:!?])", r"\1", text)  # spaces left by tag stripping
        if not text:
            continue
        if re.fullmatch(r"[\d\s\-–—]+", text):
            continue  # chapter-number navigation strip, e.g. "1 - 2 - 3 ..."
        if text.startswith("From the Bohn's Classical Library Edition"):
            continue  # per-page edition attribution boilerplate
        paragraphs.append(text)
    return paragraphs


HEADING_RE = re.compile(r"<h([23])[^>]*>(.*?)</h\1>", re.S)


def split_chapters(page_html: str) -> list[tuple[int, list[str]]]:
    """Split a many-chapter page into (chapter_number, paragraphs) by its
    numbered <h2>/<h3> headings. Content before the first numbered heading
    (mastheads, section TOCs) and from the Footnotes heading on is dropped."""
    page_html = _clean_html(page_html)

    marks: list[tuple[int | None, int, int]] = []  # (chapter, start, end of heading)
    for m in HEADING_RE.finditer(page_html):
        label = re.sub(r"<[^>]+>", "", m.group(2))
        label = html_lib.unescape(label).strip()
        num = re.match(r"([IVXLC]+|\d+)\.?(\s|$|\[)", label + " ")
        if num:
            token = num.group(1)
            chapter = int(token) if token.isdigit() else roman_to_int(token)
            marks.append((chapter, m.start(), m.end()))
        else:
            marks.append((None, m.start(), m.end()))  # e.g. "Footnotes"

    chapters = []
    for i, (chapter, _, body_start) in enumerate(marks):
        if chapter is None:
            continue
        body_end = marks[i + 1][1] if i + 1 < len(marks) else len(page_html)
        paragraphs = _paragraphs(page_html[body_start:body_end])
        if paragraphs:
            chapters.append((chapter, paragraphs))
    return chapters


def chunk_passages(
    work: str, book: int | None, chapter: int, paragraphs: list[str]
) -> list[tuple[str, str]]:
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
    if len(merged) > 1 and sum(len(p) for p in merged[0]) < CHUNK_MIN_CHARS:
        merged[1] = merged[0] + merged[1]
        del merged[0]
    chunks = merged

    base = f"{work} {chapter}" if book is None else f"{work} {book}.{chapter}"
    if len(chunks) == 1:
        return [(base, "\n\n".join(chunks[0]))]
    return [
        (f"{base}.{i}", "\n\n".join(chunk))
        for i, chunk in enumerate(chunks, start=1)
    ]


def build_work(
    work: str, translator: str, expected: dict, pages: list
) -> tuple[list[dict], list[str]]:
    items: list[dict] = []
    problems: list[str] = []
    seen: dict[int | None, list[int]] = {}
    for page, book, chapter in pages:
        page_html = fetch_page_html(page)
        if page_html is None:
            problems.append(f"missing page {page!r}")
            continue
        if chapter is not None:
            paragraphs = _paragraphs(_clean_html(
                page_html.split('<h2 id="Footnotes"')[0]))
            chapters = [(chapter, paragraphs)] if paragraphs else []
        else:
            chapters = split_chapters(page_html)
        if not chapters:
            problems.append(f"no chapters parsed from {page!r}")
            continue
        seen.setdefault(book, []).extend(c for c, _ in chapters)
        for chapter_num, paragraphs in chapters:
            for reference, text in chunk_passages(work, book, chapter_num, paragraphs):
                items.append(
                    {
                        "author": AUTHOR,
                        "work": work,
                        "reference": reference,
                        "translator": translator,
                        "text": text,
                    }
                )

    for book, numbers in seen.items():
        where = work if book is None else f"{work} book {book}"
        if sorted(numbers) != list(range(1, len(numbers) + 1)):
            problems.append(f"{where}: non-contiguous chapters {sorted(numbers)}")
        want = expected.get(book)
        if want is not None and len(numbers) != want:
            problems.append(f"{where}: parsed {len(numbers)} chapters, expected {want}")
    return items, problems


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--work", help="Restrict to one work (default: all)")
    args = parser.parse_args()

    works = [w for w in WORKS if args.work is None or w[0] == args.work]
    if not works:
        sys.exit(f"Unknown work {args.work!r}; choose from "
                 + ", ".join(w[0] for w in WORKS))

    items: list[dict] = []
    problems: list[str] = []
    for work, translator, expected, pages in works:
        work_items, work_problems = build_work(work, translator, expected, pages)
        print(f"{work}: {len(work_items)} passages")
        items.extend(work_items)
        problems.extend(work_problems)

    print(f"\nPrepared {len(items)} passages total")
    if problems:
        for p in problems:
            print("PROBLEM:", p)
        if not args.dry_run:
            sys.exit("Refusing to ingest with parse problems (use --dry-run to inspect)")

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
