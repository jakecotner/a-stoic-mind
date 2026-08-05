"""Ingest Emerson's core works for the Transcendentalist corpus:

- Self-Reliance, Compensation, The Over-Soul — Essays: First Series (PG 2944)
- Experience                                 — Essays: Second Series (PG 2945)
- Nature (1836)                              — PG 29433

Chunking: one passage per paragraph. The flat essays are referenced
"<Work> <paragraph>" ("Self-Reliance 12"); Nature is chaptered like Walden,
"Nature <chapter>.<paragraph>", with the Introduction as chapter 1 and the
eight titled chapters as 2-9. Verse epigraphs before each essay are
editorial front matter and are not ingested. Paragraph numbering is this
script's own; frozen after ingest (renumbering orphans references).

Source quirks handled here:
- First Series prints each essay title twice (epigraph page, then the
  essay) — the essay starts at the second occurrence.
- Second Series marks the essay start with a numbered heading
  ("II. EXPERIENCE.") after an indented epigraph; it also uses "--" for
  em-dashes and opens paragraphs with an ALL-CAPS word — both normalized
  to match the rest of the corpus.

English originals — translator is stored empty.

Usage (from backend/, venv active):
    .venv/Scripts/python scripts/ingest/ingest_emerson.py --dry-run
    .venv/Scripts/python scripts/ingest/ingest_emerson.py

Idempotent: passages already present (matched by reference) are skipped.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ingest_common import fetch_cached, paragraphs_from_lines  # noqa: E402

DATA = Path(__file__).parent / "data"

AUTHOR = "Ralph Waldo Emerson"
TRADITION = "transcendentalism"

SERIES1_URL = "https://www.gutenberg.org/cache/epub/2944/pg2944.txt"
SERIES2_URL = "https://www.gutenberg.org/cache/epub/2945/pg2945.txt"
NATURE_URL = "https://www.gutenberg.org/cache/epub/29433/pg29433.txt"

# First Series contents in print order — needed to find where an essay ends
# (the next essay's epigraph-page heading).
SERIES1_ORDER = [
    "HISTORY",
    "SELF-RELIANCE",
    "COMPENSATION",
    "SPIRITUAL LAWS",
    "LOVE",
    "FRIENDSHIP",
    "PRUDENCE",
    "HEROISM",
    "THE OVER-SOUL",
    "CIRCLES",
    "INTELLECT",
    "ART",
]
SERIES1_WANTED = {
    "SELF-RELIANCE": "Self-Reliance",
    "COMPENSATION": "Compensation",
    "THE OVER-SOUL": "The Over-Soul",
}

# Nature's nine reading units, in order; the chapter number is the index+1.
NATURE_CHAPTERS = [
    "INTRODUCTION.",
    "NATURE.",
    "COMMODITY.",
    "BEAUTY.",
    "LANGUAGE.",
    "DISCIPLINE.",
    "IDEALISM.",
    "SPIRIT.",
    "PROSPECTS.",
]

END_MARK = "*** END OF THE PROJECT GUTENBERG"

# Printer's labels that fall inside a sliced region: the next essay's roman
# numeral ("IV."), Nature's "CHAPTER V." labels, asterisk dividers.
_LABEL = re.compile(r"(CHAPTER )?[IVXLC]+\.$|\*+$")


def _drop_labels(paras: list[str]) -> list[str]:
    return [p for p in paras if not _LABEL.fullmatch(p)]


def _normalize_typography(text: str) -> str:
    """Printer's conventions in pg2945 and pg29433 -> the corpus's:
    em-dashes and the ALL-CAPS opening word."""
    text = text.replace("--", "—")
    return re.sub(
        r"^([A-Z]{2,})\b",
        lambda m: m.group(1).capitalize(),
        text,
    )


def series1_essays() -> list[tuple[str, list[str]]]:
    lines = fetch_cached(
        SERIES1_URL, DATA / "emerson_essays1_pg2944.txt"
    ).splitlines()
    heading_at = {
        title: [i for i, ln in enumerate(lines) if ln == title]
        for title in SERIES1_ORDER
    }
    for title, hits in heading_at.items():
        if len(hits) != 2:
            raise RuntimeError(
                f"{title}: expected 2 heading occurrences, found {len(hits)}"
            )
    out = []
    for idx, title in enumerate(SERIES1_ORDER):
        if title not in SERIES1_WANTED:
            continue
        start = heading_at[title][1]  # second occurrence: the essay proper
        if idx + 1 < len(SERIES1_ORDER):
            end = heading_at[SERIES1_ORDER[idx + 1]][0]
        else:
            end = next(
                i for i, ln in enumerate(lines) if ln.startswith(END_MARK)
            )
        paras = _drop_labels(paragraphs_from_lines(lines[start + 1 : end]))
        out.append((SERIES1_WANTED[title], paras))
    return out


def experience() -> list[str]:
    lines = fetch_cached(
        SERIES2_URL, DATA / "emerson_essays2_pg2945.txt"
    ).splitlines()
    start = next(
        i for i, ln in enumerate(lines) if re.fullmatch(r"[IVX]+\. EXPERIENCE\.", ln)
    )
    # The essay runs to the next essay's indented epigraph heading.
    end = next(
        i for i, ln in enumerate(lines)
        if i > start and re.fullmatch(r"\s{4,}[A-Z][A-Z\- ]+\.", ln)
    )
    paras = _drop_labels(paragraphs_from_lines(lines[start + 1 : end]))
    return [_normalize_typography(p) for p in paras]


def nature_chapters() -> list[tuple[int, str, list[str]]]:
    lines = fetch_cached(NATURE_URL, DATA / "nature_pg29433.txt").splitlines()
    positions = []
    for title in NATURE_CHAPTERS:
        hits = [i for i, ln in enumerate(lines) if ln == title]
        if len(hits) != 1:
            raise RuntimeError(f"Nature {title}: found {len(hits)} headings")
        positions.append(hits[0])
    if positions != sorted(positions):
        raise RuntimeError("Nature chapters out of order")
    end_of_book = next(
        i for i, ln in enumerate(lines) if ln.startswith(END_MARK)
    )
    out = []
    for n, (title, start) in enumerate(zip(NATURE_CHAPTERS, positions), start=1):
        end = positions[n] if n < len(positions) else end_of_book
        paras = _drop_labels(paragraphs_from_lines(lines[start + 1 : end]))
        if not paras:
            raise RuntimeError(f"Nature {title}: no text parsed")
        out.append(
            (n, title.rstrip(".").title(), [_normalize_typography(p) for p in paras])
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="parse and show the chunk plan; no DB")
    args = parser.parse_args()

    flat: list[tuple[str, list[str]]] = series1_essays()
    flat.append(("Experience", experience()))
    nature = nature_chapters()

    for work, paras in flat:
        sizes = sorted(len(p) for p in paras)
        print(
            f"{work}: {len(paras)} paragraphs "
            f"({sizes[0]}-{sizes[-1]} chars, median {sizes[len(sizes) // 2]})"
        )
    n_nature = sum(len(p) for _, _, p in nature)
    print(f"Nature: {len(nature)} chapters -> {n_nature} passages")

    if args.dry_run:
        for work, paras in flat:
            print(f"\n--- {work} 1 ---\n{paras[0][:280]}")
        for n, title, paras in nature:
            print(f"  Nature {n} ({title}): {len(paras)} paragraphs")
        return

    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import Passage

    def add(db, existing, work, reference, position, text) -> int:
        if reference in existing:
            return 0
        db.add(
            Passage(
                author=AUTHOR,
                work=work,
                reference=reference,
                position=position,
                translator="",
                text=text,
                tradition=TRADITION,
            )
        )
        return 1

    inserted = total = 0
    with SessionLocal() as db:
        existing = set(db.scalars(select(Passage.reference)))
        for work, paras in flat:
            for i, text in enumerate(paras, start=1):
                inserted += add(db, existing, work, f"{work} {i}", i, text)
                total += 1
        position = 0
        for n, _title, paras in nature:
            for i, text in enumerate(paras, start=1):
                position += 1
                inserted += add(
                    db, existing, "Nature", f"Nature {n}.{i}", position, text
                )
                total += 1
        db.commit()
    print(f"Inserted {inserted} passages ({total - inserted} already present)")


if __name__ == "__main__":
    main()
