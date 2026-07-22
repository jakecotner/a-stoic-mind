"""Attach the original Latin to Seneca's Moral Letters passages.

Source: Perseus Digital Library TEI XML (canonical-latinLit phi1017.phi015),
Richard Gummere's Loeb Latin text (1917-25), CC BY-SA 4.0 — the SAME edition
our English translation renders, so Gummere's section numbers line up by
construction (verified: all 862 references parse and every cited span exists).

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_seneca_latin --dry-run
    python -m scripts.ingest_seneca_latin

Alignment: English passages are size-based chunks citing section ranges
("Letters 78.4-6"); each gets the Latin of exactly those sections. Wrinkles:
- Range endpoints came from markers detected in the English text, so
  consecutive chunks may share a boundary section; the from-original
  translation prompt tells the model to translate only the span the English
  reference covers.
- A letter's LAST chunk always runs to the letter's end, so its range is
  extended to the final section (fixes letters 49 and 108, whose final
  marker went undetected during English ingestion).

Text: critical-apparatus <note>s are dropped; in <choice> pairs the editor's
<corr> reading is kept and the manuscript <sic> dropped.

Idempotent: passages that already have an original are skipped (--force to
re-set). Cached LLM translations of updated passages are deleted (superseded
by from-the-original translations).
"""

import argparse
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from scripts.ingest_common import apply_originals, fetch_cached

XML_URL = (
    "https://raw.githubusercontent.com/PerseusDL/canonical-latinLit/master/"
    "data/phi1017/phi015/phi1017.phi015.perseus-lat2.xml"
)
CACHE_PATH = Path(__file__).parent / "data" / "seneca_perseus_lat2.xml"

WORK = "Moral Letters to Lucilius"
LANGUAGE = "la"
SOURCE = "Gummere (Loeb 1917-25), Perseus Digital Library, CC BY-SA 4.0"

NS = {"t": "http://www.tei-c.org/ns/1.0"}
REF_RE = re.compile(r"^Letters (\d+)(?:\.(\d+)(?:-(\d+))?)?$")

# Subtrees that are editorial machinery, not reading text.
_SKIP_TAGS = {"note", "sic"}


def _section_text(section: ET.Element) -> str:
    """Reading text of one section, skipping apparatus subtrees but keeping
    their tails (text following a skipped element belongs to the flow)."""
    parts: list[str] = []

    def walk(el: ET.Element) -> None:
        if el.text:
            parts.append(el.text)
        for child in el:
            if child.tag.split("}")[1] not in _SKIP_TAGS:
                walk(child)
            if child.tail:
                parts.append(child.tail)

    walk(section)
    return " ".join("".join(parts).split())


def parse_letters(raw: str) -> dict[int, dict[int, str]]:
    """Return {letter: {section: latin_text}}."""
    edition = ET.fromstring(raw).find(".//t:text/t:body/t:div", NS)
    letters: dict[int, dict[int, str]] = {}
    for book in edition.findall("t:div", NS):
        for letter in book.findall("t:div", NS):
            letters[int(letter.get("n"))] = {
                int(sec.get("n")): _section_text(sec)
                for sec in letter.findall("t:div", NS)
            }
    if len(letters) != 124:
        raise RuntimeError(f"Expected 124 Latin letters, found {len(letters)}")
    return letters


def build_originals(
    refs_in_id_order: list[str], letters: dict[int, dict[int, str]]
) -> dict[str, str]:
    """Map each English reference to its Latin text."""
    # The last chunk of each letter (passages are in reading order).
    last_ref_of_letter: dict[int, str] = {}
    for ref in refs_in_id_order:
        m = REF_RE.match(ref)
        if m:
            last_ref_of_letter[int(m.group(1))] = ref

    result: dict[str, str] = {}
    for ref in refs_in_id_order:
        m = REF_RE.match(ref)
        if not m:
            print(f"  UNPARSABLE reference {ref!r}")
            continue
        n = int(m.group(1))
        sections = letters.get(n)
        if sections is None:
            print(f"  NO LATIN LETTER for {ref}")
            continue
        if m.group(2) is None:
            lo, hi = 1, max(sections)
        else:
            lo = int(m.group(2))
            hi = int(m.group(3)) if m.group(3) else lo
        if ref == last_ref_of_letter[n]:
            hi = max(sections)
        missing = [s for s in range(lo, hi + 1) if s not in sections]
        if missing:
            print(f"  MISSING Latin sections {missing} for {ref}")
            continue
        result[ref] = " ".join(sections[s] for s in range(lo, hi + 1))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="re-set originals that are already present")
    args = parser.parse_args()

    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Passage

    letters = parse_letters(fetch_cached(XML_URL, CACHE_PATH))
    with SessionLocal() as db:
        refs = list(
            db.scalars(
                select(Passage.reference)
                .where(Passage.work == WORK)
                .order_by(Passage.id)
            )
        )
        originals = build_originals(refs, letters)
        print(f"Mapped {len(originals)} of {len(refs)} passages to Latin")

        if args.dry_run:
            for ref in [refs[0], "Letters 78.1-5"] + [
                r for r in refs if r.startswith("Letters 49.")
            ][-1:]:
                if ref in originals:
                    print(f"\n--- {ref} ---\n{originals[ref][:300]}")
            return

        apply_originals(db, WORK, originals, LANGUAGE, SOURCE, force=args.force)


if __name__ == "__main__":
    sys.exit(main())
