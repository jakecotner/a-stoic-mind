"""Seed the Transcendentalist daily-passage pool (passages.curated).

An initial editorial selection of high-impact passages across the
Transcendentalist corpus — the counterpart of curate_daily_pool.py for
Stoicism. Idempotent: marks listed passages curated and reports what
didn't match. The pool is expected to be shaped over time from the admin
surface; this script is the starting point, not the authority.

Run from backend/:  .venv/Scripts/python scripts/curate_transcendental_pool.py
    --reset  first clears the curated flag on transcendentalist passages
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import false, func, select, update  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models import Passage  # noqa: E402

TRADITION = "transcendentalism"

CURATED: list[str] = [
    # Thoreau, Walden
    "Walden 1.8",    # overwork crowds out life's finer fruits
    "Walden 1.11",   # "the mass of men lead lives of quiet desperation"
    "Walden 1.17",   # "as many ways as can be drawn radii from one centre"
    "Walden 1.21",   # to be a philosopher is to live simply
    "Walden 1.38",   # "beware of all enterprises that require new clothes"
    "Walden 2.16",   # "to affect the quality of the day, that is the highest of arts"
    "Walden 2.17",   # "I went to the woods because I wished to live deliberately"
    "Walden 2.18",   # "Simplicity, simplicity, simplicity!"
    "Walden 2.23",   # "spend one day as deliberately as Nature"
    "Walden 2.24",   # "Time is but the stream I go a-fishing in"
    "Walden 3.11",   # a book can date a new era in a life
    "Walden 4.1",    # the discipline of looking always at what is to be seen
    "Walden 4.2",    # a broad margin to life
    "Walden 5.11",   # the inner spectator, beside ourselves in a sane sense
    "Walden 5.12",   # "so companionable as solitude"
    "Walden 5.13",   # "society is commonly too cheap"
    "Walden 5.17",   # the innocence and beneficence of Nature
    "Walden 7.17",   # cease from anxiety; relinquish claim to the harvest
    "Walden 9.17",   # a lake is the landscape's most beautiful feature
    "Walden 10.10",  # come home from afar, with new experience daily
    "Walden 11.8",   # listen to the faintest suggestions of your genius
    "Walden 11.11",  # "our whole life is startlingly moral"
    "Walden 11.15",  # every man the builder of a temple, called his body
    "Walden 16.1",   # waking to an answered question; nature asks none
    "Walden 17.19",  # "live in the present... a single gentle rain"
    "Walden 17.24",  # the tonic of wildness
    "Walden 18.6",   # "I had several more lives to live"; ruts of habit
    "Walden 18.7",   # "advances confidently in the direction of his dreams"
    "Walden 18.12",  # "hears a different drummer"
    "Walden 18.15",  # "However mean your life is, meet it and live it"
    "Walden 18.21",  # "The sun is but a morning star"
    # Emerson, Self-Reliance
    "Self-Reliance 2",   # "envy is ignorance; imitation is suicide"
    "Self-Reliance 3",   # "Trust thyself: every heart vibrates to that iron string"
    "Self-Reliance 7",   # "whoso would be a man, must be a nonconformist"
    "Self-Reliance 8",   # live, don't expiate; life for itself
    "Self-Reliance 9",   # independence of solitude amid the crowd
    "Self-Reliance 14",  # "a foolish consistency is the hobgoblin of little minds"
    "Self-Reliance 15",  # no man can violate his nature; honest thought
    "Self-Reliance 23",  # the roses under my window; live above time
    "Self-Reliance 41",  # "travelling is a fool's paradise"
    "Self-Reliance 43",  # "Insist on yourself; never imitate"
    "Self-Reliance 50",  # "nothing can bring you peace but yourself"
    # Emerson, Compensation
    "Compensation 15",  # justice is not postponed
    "Compensation 28",  # a man cannot speak but he judges himself
    "Compensation 30",  # fear diagnoses wrong in our relations
    "Compensation 40",  # our strength grows out of our weakness
    "Compensation 50",  # angels go out that archangels may come in
    "Compensation 51",  # the compensations of calamity
    # Emerson, The Over-Soul
    "The Over-Soul 1",   # faith comes in moments
    "The Over-Soul 3",   # "within man is the soul of the whole"
    "The Over-Soul 19",  # stop forecasting; work and live in today
    "The Over-Soul 21",  # let others judge themselves
    "The Over-Soul 28",  # what is really for you gravitates to you
    "The Over-Soul 29",  # go into solitude and listen
    # Emerson, Experience
    "Experience 4",   # grief's shallowness, honestly examined
    "Experience 6",   # moods are colored lenses
    "Experience 14",  # the mid-world is best; stick to your task
    "Experience 24",  # preoccupied attention against frivolity
    "Experience 27",  # "patience and patience... up again, old heart"
    # Emerson, Nature
    "Nature 1.1",   # "an original relation to the universe"
    "Nature 2.1",   # go into solitude; look at the stars
    "Nature 2.2",   # nature never wears a mean appearance
    "Nature 2.3",   # the poet owns the landscape no deed can grant
    "Nature 2.4",   # the transparent eye-ball
    "Nature 2.6",   # "Nature always wears the colors of the spirit"
    "Nature 4.5",   # "give me health and a day"
    "Nature 4.7",   # the attentive eye finds each moment's beauty
    "Nature 9.11",  # see the miraculous in the common
    # Thoreau, Walking
    "Walking 2",   # the art of sauntering
    "Walking 10",  # the walk as the day's adventure, not exercise
    "Walking 13",  # return to your senses on a walk
    "Walking 21",  # the inner compass that settles where to walk
    "Walking 37",  # "in Wildness is the preservation of the World"
    "Walking 43",  # "life consists with wildness; the most alive is the wildest"
    "Walking 83",  # we cannot afford not to live in the present
    "Walking 87",  # "So we saunter toward the Holy Land"
    # Thoreau, Civil Disobedience
    "Civil Disobedience 1",   # "That government is best which governs least"
    "Civil Disobedience 16",  # action from principle changes things
    "Civil Disobedience 19",  # be counter-friction to the machine
    "Civil Disobedience 20",  # do something, not everything
    "Civil Disobedience 23",  # "the true place for a just man is also a prison"
    "Civil Disobedience 28",  # breathe after your own fashion
    # Thoreau, Life Without Principle
    "Life Without Principle 9",   # work for love of the work, not wages
    "Life Without Principle 12",  # don't spend life getting a living
    "Life Without Principle 14",  # constantly elevate your aim
    "Life Without Principle 32",  # a day's wealth deserves full devotion, not news
    "Life Without Principle 38",  # guard the mind; read Eternities, not Times
    # Margaret Fuller, Woman in the Nineteenth Century
    "Woman in the Nineteenth Century 13",   # the soul obtains what it truly seeks
    "Woman in the Nineteenth Century 62",   # "What Woman needs"
    "Woman in the Nineteenth Century 134",  # freedom as every being's birthright
    "Woman in the Nineteenth Century 297",  # "let us be wise, and not impede the soul"
    "Woman in the Nineteenth Century 303",  # the soul poised upon itself
    "Woman in the Nineteenth Century 304",  # solitude renews the inner resources
    "Woman in the Nineteenth Century 533",  # self-grounding before love
    "Woman in the Nineteenth Century 544",  # the sunset meditation; give life, shine
    "Woman in the Nineteenth Century 545",  # "I stand in the sunny noon of life"
]


def main() -> None:
    reset = "--reset" in sys.argv
    matched = 0
    missing: list[str] = []
    with SessionLocal() as db:
        if reset:
            # Scoped to this tradition — the Stoic pool curates separately.
            db.execute(
                update(Passage)
                .where(Passage.tradition == TRADITION)
                .values(curated=false())
            )
        for entry in CURATED:
            passage = db.scalar(
                select(Passage).where(Passage.reference == entry)
            )
            if passage is None:
                missing.append(entry)
                continue
            passage.curated = True
            matched += 1
        db.commit()
        total = db.scalar(
            select(func.count())
            .select_from(Passage)
            .where(Passage.curated, Passage.tradition == TRADITION)
        )
    print(f"curated: {matched} entries matched, {TRADITION} pool size now {total}")
    if missing:
        print("NO MATCH for:")
        for entry in missing:
            print(f"  {entry}")


if __name__ == "__main__":
    main()
