"""Seed the daily-passage curated pool (passages.curated).

An initial editorial selection of high-impact passages across the corpus.
Idempotent: marks listed passages curated and reports what didn't match.
The pool is expected to be shaped over time from the admin surface; this
script is the starting point, not the authority.

Entries are either an exact reference ("Enchiridion 5") or a section that
the ingest chunked finer ("Letters 13" → the first chunk, "Letters 13.1-3").

Run from backend/:  .venv/Scripts/python scripts/curate_daily_pool.py
    --reset  first clears the curated flag everywhere
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import false, func, select, update  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models import Passage  # noqa: E402

CURATED: list[str] = [
    # Epictetus, Enchiridion
    "Enchiridion 1", "Enchiridion 2", "Enchiridion 5", "Enchiridion 7",
    "Enchiridion 8", "Enchiridion 9", "Enchiridion 10", "Enchiridion 11",
    "Enchiridion 14", "Enchiridion 15", "Enchiridion 17", "Enchiridion 20",
    "Enchiridion 21", "Enchiridion 26", "Enchiridion 33", "Enchiridion 43",
    "Enchiridion 48",
    # Marcus Aurelius, Meditations
    "Meditations 2.1", "Meditations 2.5", "Meditations 2.11",
    "Meditations 2.14", "Meditations 2.17", "Meditations 3.10",
    "Meditations 4.3", "Meditations 4.7", "Meditations 4.17",
    "Meditations 4.24", "Meditations 4.31", "Meditations 4.49",
    "Meditations 5.1", "Meditations 5.16", "Meditations 5.20",
    "Meditations 6.6", "Meditations 6.13", "Meditations 6.48",
    "Meditations 7.9", "Meditations 7.18", "Meditations 7.56",
    "Meditations 7.59", "Meditations 8.5", "Meditations 8.36",
    "Meditations 8.47", "Meditations 9.6", "Meditations 9.13",
    "Meditations 10.16", "Meditations 12.1", "Meditations 12.36",
    # Seneca, Moral Letters (first chunk of each letter)
    "Letters 1", "Letters 2", "Letters 3", "Letters 5", "Letters 7",
    "Letters 9", "Letters 12", "Letters 13", "Letters 16", "Letters 18",
    "Letters 26", "Letters 28", "Letters 41", "Letters 49", "Letters 63",
    "Letters 78", "Letters 88", "Letters 91", "Letters 101", "Letters 107",
    "Letters 123",
    # Epictetus, Discourses (first chunk of each chapter)
    "Discourses 1.1", "Discourses 1.24", "Discourses 2.5",
    "Discourses 3.24", "Discourses 4.1",
    # Seneca, dialogues and essays
    "On the Shortness of Life 1", "On the Shortness of Life 2",
    "On the Shortness of Life 3", "Of Providence 2", "Of Peace of Mind 2",
    "Of Anger 2.10", "Of a Happy Life 1",
]


def main() -> None:
    reset = "--reset" in sys.argv
    matched = 0
    missing: list[str] = []
    with SessionLocal() as db:
        if reset:
            db.execute(update(Passage).values(curated=false()))
        for entry in CURATED:
            passage = db.scalar(
                select(Passage).where(Passage.reference == entry)
            )
            if passage is None:
                # Section chunked finer than the entry: take its first chunk.
                passage = db.scalar(
                    select(Passage)
                    .where(Passage.reference.like(entry + ".%"))
                    .order_by(Passage.position)
                    .limit(1)
                )
            if passage is None:
                missing.append(entry)
                continue
            passage.curated = True
            matched += 1
        db.commit()
        total = db.scalar(
            select(func.count()).select_from(Passage).where(Passage.curated)
        )
    print(f"curated: {matched} entries matched, pool size now {total}")
    if missing:
        print("NO MATCH for:")
        for entry in missing:
            print(f"  {entry}")


if __name__ == "__main__":
    main()
