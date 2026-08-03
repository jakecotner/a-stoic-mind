"""Ingest the Lectures of Musonius Rufus, translated from the Greek by Claude.

No public-domain English translation of Musonius exists (Lutz 1947 and King
2011 are both in copyright), so this ingest translates the public-domain
Greek directly: Hense's Teubner 1905 edition via First1KGreek / Open Greek
and Latin (urn:cts:greekLit:tlg0628.tlg001.1st1K-grc1, CC BY-SA 4.0).
The Greek is stored on original_text; original_source carries the required
attribution.

The 21 lectures (24 with Lutz's 13a/13b, 15a/15b, 18a/18b splits) arrive as
one TEI div each. Short lectures become one passage ("Lectures 5"); long
ones are split at sentence boundaries into even chunks ("Lectures 16.1").
Chunk numbering is this script's own — Musonius has no customary section
numbers — so re-chunking would orphan references; don't change the chunk
constants after ingest.

Translations are one Claude call per chunk, sequential within a lecture
with the lecture-so-far English passed back in for continuity, and cached
under data/musonius_translations/ so re-runs never re-pay.

Usage (from backend/, venv active):
    .venv/Scripts/python scripts/ingest/ingest_musonius.py --dry-run
    .venv/Scripts/python scripts/ingest/ingest_musonius.py [--lectures 1,13a]

Idempotent: passages already present (matched by reference) are skipped.
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

XML_PATH = Path(__file__).parent / "data" / "musonius_1st1K-grc1.xml"
XML_URL = (
    "https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/master/"
    "data/tlg0628/tlg001/tlg0628.tlg001.1st1K-grc1.xml"
)
TRANSLATION_CACHE = Path(__file__).parent / "data" / "musonius_translations"

AUTHOR = "Musonius Rufus"
WORK = "Lectures"
TRANSLATOR = "A Stoic Mind (from the Greek)"
LANGUAGE = "grc"
SOURCE = "Hense (Teubner 1905), First1KGreek / Open Greek and Latin, CC BY-SA 4.0"

# A lecture up to this size stays one passage; larger ones are split into
# ceil(len / CHUNK_TARGET) even chunks. Frozen after ingest (see docstring).
SINGLE_MAX_CHARS = 2800
CHUNK_TARGET_CHARS = 2200

NS = {"t": "http://www.tei-c.org/ns/1.0"}

TRANSLATION_SYSTEM_PROMPT = """\
You are translating the Lectures of the Stoic philosopher Musonius Rufus
from ancient Greek into English, for "A Stoic Mind", a reading companion
for the classic Stoic texts.

Render the Greek into clear, dignified, contemporary English prose:
- Faithful to the argument, sentence by sentence — do not compress, do not
  embellish, do not add anything.
- Plain modern vocabulary; no archaisms, no slang.
- Standard renderings of Stoic terms, kept consistent: arete = virtue,
  sophrosyne = self-control, phronesis = practical wisdom, askesis =
  training. Conventional English forms of proper names.
- The source is a critical edition of lecture notes; where the Greek is
  elliptical or corrupt, translate the most plausible sense smoothly, with
  no brackets or translator's notes. Only where the edition marks text as
  lost (a run of dots), keep the gap as " . . . " rather than inventing
  content.
- The lectures were written down by Musonius's student and often carry a
  reported-speech frame ("he said", "he urged") — preserve that frame.

Output only the translation itself: no title, no preamble, no notes.
"""


def fetch_xml() -> str:
    if XML_PATH.exists():
        return XML_PATH.read_text(encoding="utf-8")
    import httpx

    print(f"Downloading {XML_URL} ...")
    resp = httpx.get(XML_URL, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    XML_PATH.parent.mkdir(parents=True, exist_ok=True)
    XML_PATH.write_text(resp.text, encoding="utf-8")
    return resp.text


def _reading_text(el: ET.Element) -> str:
    """Flatten an element to a reading text: editorial deletions ([...])
    dropped, editorial additions unwrapped, obeli and lacuna marks removed."""
    text = "".join(el.itertext())
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = text.translate(str.maketrans("", "", "⟨⟩〈〉†*"))
    return " ".join(text.split())


def parse_lectures(raw: str) -> list[dict]:
    """Return [{n, title, paragraphs}] in document order (1..21, a/b splits
    inline), matching Lutz's standard numbering."""
    edition = ET.fromstring(raw).find(".//t:text/t:body/t:div", NS)
    lectures = []
    for div in edition.findall("t:div", NS):
        head = div.find("t:head", NS)
        paragraphs = [
            text for p in div.findall("t:p", NS) if (text := _reading_text(p))
        ]
        if not paragraphs:
            raise RuntimeError(f"Lecture {div.get('n')}: no text parsed")
        lectures.append(
            {
                "n": div.get("n"),
                "title": _reading_text(head) if head is not None else "",
                "paragraphs": paragraphs,
            }
        )
    if len(lectures) != 24:
        raise RuntimeError(f"Expected 24 lecture divs, found {len(lectures)}")
    return lectures


def _sentences(paragraphs: list[str]) -> list[tuple[str, bool]]:
    """(sentence, starts_new_paragraph) pairs. Greek sentence ends are '.'
    and ';' (the Greek question mark); '·' is a colon, not an end."""
    out = []
    for para in paragraphs:
        parts = re.split(r"(?<=[.;])\s+", para)
        for i, part in enumerate(parts):
            if part:
                out.append((part, i == 0))
    return out


def chunk_lecture(lecture: dict) -> list[tuple[str, str]]:
    """Split one lecture into [(reference, greek_text)]."""
    total = sum(len(p) for p in lecture["paragraphs"]) + 2 * (
        len(lecture["paragraphs"]) - 1
    )
    n = lecture["n"]
    if total <= SINGLE_MAX_CHARS:
        return [(f"{WORK} {n}", "\n\n".join(lecture["paragraphs"]))]

    n_chunks = -(-total // CHUNK_TARGET_CHARS)  # ceil
    chunks: list[str] = []
    current = ""
    consumed = 0
    for sentence, new_para in _sentences(lecture["paragraphs"]):
        if current:
            current += "\n\n" if new_para else " "
        current += sentence
        consumed += len(sentence)
        # Flush at the even-split boundary for the next chunk index.
        if len(chunks) < n_chunks - 1 and consumed >= total * (len(chunks) + 1) / n_chunks:
            chunks.append(current)
            current = ""
    if current:
        chunks.append(current)
    return [(f"{WORK} {n}.{i}", text) for i, text in enumerate(chunks, start=1)]


def _cache_path(reference: str) -> Path:
    return TRANSLATION_CACHE / (
        re.sub(r"[^a-z0-9]+", "_", reference.lower()).strip("_") + ".txt"
    )


def translate_chunk(
    client, model: str, lecture: dict, reference: str, greek: str, english_so_far: str
) -> str:
    """One cached Claude call. Cache key is the reference — stable because
    chunk boundaries are frozen."""
    cache = _cache_path(reference)
    if cache.exists():
        return cache.read_text(encoding="utf-8")

    parts = [
        f"Lecture {lecture['n']} of Musonius Rufus."
        + (f" Greek title: {lecture['title']}" if lecture["title"] else "")
    ]
    if english_so_far:
        parts.append(
            "The lecture so far, already translated (for continuity of terms "
            "and tone — do not repeat any of it):\n\n" + english_so_far
        )
        parts.append("Translate this continuation of the lecture:\n\n" + greek)
    else:
        parts.append("Translate this:\n\n" + greek)

    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=TRANSLATION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": "\n\n---\n\n".join(parts)}],
    )
    english = "".join(b.text for b in message.content if b.type == "text").strip()
    if not 0.5 <= len(english) / len(greek) <= 2.5:
        print(
            f"  WARNING {reference}: suspicious length ratio "
            f"({len(greek)} Greek -> {len(english)} English chars)"
        )
    TRANSLATION_CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(english, encoding="utf-8")
    return english


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and show the chunk plan; no API, no DB")
    parser.add_argument("--lectures", default=None,
                        help="comma-separated lecture numbers, e.g. 1,13a")
    args = parser.parse_args()

    lectures = parse_lectures(fetch_xml())
    if args.lectures:
        wanted = {w.strip() for w in args.lectures.split(",")}
        lectures = [lec for lec in lectures if lec["n"] in wanted]

    plan = [(lecture, chunk_lecture(lecture)) for lecture in lectures]
    n_passages = sum(len(chunks) for _, chunks in plan)
    print(f"{len(plan)} lectures -> {n_passages} passages")

    if args.dry_run:
        for lecture, chunks in plan:
            sizes = ", ".join(str(len(text)) for _, text in chunks)
            print(f"  {lecture['n']:>3} ({sizes} chars): {lecture['title'][:70]}")
        return

    import anthropic

    from app.core.config import get_settings
    from app.core.db import SessionLocal
    from app.models import Passage
    from sqlalchemy import select

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    inserted = skipped = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Passage.reference)))
        # Positions continue after any prior partial run of this work.
        position = (
            db.scalar(
                select(Passage.position)
                .where(Passage.work == WORK, Passage.author == AUTHOR)
                .order_by(Passage.position.desc())
                .limit(1)
            )
            or 0
        )
        for lecture, chunks in plan:
            english_so_far = ""
            for reference, greek in chunks:
                if reference in existing:
                    # Keep continuity context intact when resuming.
                    cache = _cache_path(reference)
                    if cache.exists():
                        english_so_far = (
                            english_so_far + "\n\n" + cache.read_text(encoding="utf-8")
                        ).strip()
                    skipped += 1
                    continue
                print(f"  translating {reference} ({len(greek)} Greek chars) ...")
                english = translate_chunk(
                    client, settings.anthropic_model, lecture, reference,
                    greek, english_so_far,
                )
                english_so_far = (english_so_far + "\n\n" + english).strip()
                position += 1
                db.add(
                    Passage(
                        author=AUTHOR,
                        work=WORK,
                        reference=reference,
                        position=position,
                        translator=TRANSLATOR,
                        text=english,
                        original_text=greek,
                        original_language=LANGUAGE,
                        original_source=SOURCE,
                    )
                )
                db.commit()  # per-passage: a crash loses nothing translated
                inserted += 1
    print(f"Inserted {inserted} passages ({skipped} already present)")


if __name__ == "__main__":
    main()
