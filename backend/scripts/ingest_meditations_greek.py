"""Attach the original Greek to the Meditations passages.

Source: Perseus Digital Library TEI XML (canonical-greekLit tlg0562.tlg001),
the J.H. Leopold Teubner 1908 edition, CC BY-SA 4.0 — the original_source
column carries the attribution.

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_meditations_greek --dry-run
    python -m scripts.ingest_meditations_greek

Alignment: Perseus chapters are numbered like Long's Gutenberg sections
(reference "Meditations {book}.{chapter}") and match 1:1, except that
Leopold merges 12.18 into 12.17 — his 12.17 carries an inline "ιη′" (Greek
numeral 18) where Long's 12.18 begins, so we split there.

Idempotent: passages that already have an original are skipped (--force to
re-set). Cached LLM translations of updated passages are deleted — they were
translated from the English alone and are superseded by from-the-original
translations.
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from scripts.ingest_common import apply_originals, fetch_cached

XML_URL = (
    "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/"
    "data/tlg0562/tlg001/tlg0562.tlg001.perseus-grc2.xml"
)
CACHE_PATH = Path(__file__).parent / "data" / "meditations_perseus_grc2.xml"

WORK = "Meditations"
LANGUAGE = "grc"
SOURCE = "Leopold (Teubner 1908), Perseus Digital Library, CC BY-SA 4.0"

NS = {"t": "http://www.tei-c.org/ns/1.0"}
# Leopold's 12.17 runs Long's 12.17 and 12.18 together; the "ιη′" (18)
# chapter numeral sits at the seam as editor-deleted text: <del>ιη′</del>.
SEAM_NUMERAL = "ιη′"
SEAM_SENTINEL = "\x00"


def _chapter_text(chapter: ET.Element) -> str:
    """Reading text of one chapter: editor-deleted (<del>) content dropped,
    whitespace normalized. <add> content is part of the restored text and
    itertext() includes it naturally."""
    for del_el in chapter.iter(f"{{{NS['t']}}}del"):
        if del_el.text and del_el.text.strip() == SEAM_NUMERAL:
            # The deleted numeral marking a merged chapter's seam: keep it
            # as a sentinel so parse_chapters can split there.
            del_el.text = SEAM_SENTINEL
            continue
        # Not clear(): that would also erase the tail text after </del>.
        del_el.text = None
        for child in list(del_el):
            del_el.remove(child)
    return " ".join("".join(chapter.itertext()).split())


def parse_chapters(raw: str) -> dict[str, str]:
    """Return {reference: greek_text}, e.g. {"Meditations 1.1": "..."}."""
    work = ET.fromstring(raw).find(".//t:text/t:body/t:div", NS)
    result: dict[str, str] = {}
    for book in work.findall("t:div", NS):
        for chapter in book.findall("t:div", NS):
            ref = f"{WORK} {book.get('n')}.{chapter.get('n')}"
            result[ref] = _chapter_text(chapter)

    seam = f"{WORK} 12.17"
    parts = result[seam].split(SEAM_SENTINEL)
    if len(parts) != 2:
        raise RuntimeError(f"Expected one {SEAM_NUMERAL} split point in {seam}")
    result[seam], result[f"{WORK} 12.18"] = parts[0].strip(), parts[1].strip()
    if SEAM_SENTINEL in "".join(result.values()):
        raise RuntimeError("Unexpected seam sentinel outside 12.17")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="re-set originals that are already present")
    args = parser.parse_args()

    chapters = parse_chapters(fetch_cached(XML_URL, CACHE_PATH))
    print(f"Parsed {len(chapters)} Greek chapters")

    if args.dry_run:
        for ref in [f"{WORK} 1.1", f"{WORK} 12.17", f"{WORK} 12.18"]:
            print(f"\n--- {ref} ---\n{chapters[ref][:300]}")
        return

    from app.db import SessionLocal

    with SessionLocal() as db:
        apply_originals(db, WORK, chapters, LANGUAGE, SOURCE, force=args.force)


if __name__ == "__main__":
    sys.exit(main())
