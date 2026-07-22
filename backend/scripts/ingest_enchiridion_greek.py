"""Attach the original Greek to the Enchiridion passages.

Source: Perseus Digital Library TEI XML (canonical-greekLit tlg0557.tlg002),
the Heinrich Schenkl Teubner 1916 edition, CC BY-SA 4.0 — the original_source
column carries the attribution.

Usage (from stoa/backend, venv active):
    python -m scripts.ingest_enchiridion_greek --dry-run
    python -m scripts.ingest_enchiridion_greek

Alignment: Higginson's translation has 51 chapters against the standard 53 —
his 50 runs together Schenkl's 50 and 51 ("abide by them as laws" + "how long
will you delay"), and his 51 runs together 52 and 53 ("first and most
necessary topic" + the closing maxims). Chapters 1-49 match 1:1; all anchors
verified against the English content.

Idempotent: passages that already have an original are skipped (--force to
re-set). Cached LLM translations of updated passages are deleted (superseded
by from-the-original translations).
"""

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from scripts.ingest_common import apply_originals, fetch_cached

XML_URL = (
    "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/"
    "data/tlg0557/tlg002/tlg0557.tlg002.perseus-grc2.xml"
)
CACHE_PATH = Path(__file__).parent / "data" / "enchiridion_perseus_grc2.xml"

WORK = "Enchiridion"
LANGUAGE = "grc"
SOURCE = "Schenkl (Teubner 1916), Perseus Digital Library, CC BY-SA 4.0"

NS = {"t": "http://www.tei-c.org/ns/1.0"}

# English chapter -> the Greek chapters Higginson runs together.
MERGES = {50: (50, 51), 51: (52, 53)}


def _chapter_text(chapter: ET.Element) -> str:
    """Reading text of one chapter: editor-deleted (<del>) content dropped,
    whitespace normalized."""
    for del_el in chapter.iter(f"{{{NS['t']}}}del"):
        # Not clear(): that would also erase the tail text after </del>.
        del_el.text = None
        for child in list(del_el):
            del_el.remove(child)
    return " ".join("".join(chapter.itertext()).split())


def parse_chapters(raw: str) -> dict[str, str]:
    """Return {reference: greek_text} keyed by the ENGLISH chapter numbers."""
    work = ET.fromstring(raw).find(".//t:text/t:body/t:div", NS)
    greek = {
        int(ch.get("n")): _chapter_text(ch) for ch in work.findall("t:div", NS)
    }
    if len(greek) != 53:
        raise RuntimeError(f"Expected 53 Greek chapters, found {len(greek)}")

    result = {f"{WORK} {n}": greek[n] for n in range(1, 50)}
    for eng, (a, b) in MERGES.items():
        result[f"{WORK} {eng}"] = f"{greek[a]}\n\n{greek[b]}"
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true",
                        help="re-set originals that are already present")
    args = parser.parse_args()

    chapters = parse_chapters(fetch_cached(XML_URL, CACHE_PATH))
    print(f"Parsed {len(chapters)} references from 53 Greek chapters")

    if args.dry_run:
        for ref in [f"{WORK} 1", f"{WORK} 50", f"{WORK} 51"]:
            print(f"\n--- {ref} ---\n{chapters[ref][:300]}")
        return

    from app.db import SessionLocal

    with SessionLocal() as db:
        apply_originals(db, WORK, chapters, LANGUAGE, SOURCE, force=args.force)


if __name__ == "__main__":
    sys.exit(main())
