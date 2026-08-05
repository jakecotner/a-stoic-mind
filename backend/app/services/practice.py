"""Practice business logic: assemble the month view and the day detail from
the traces the other slices record, manage the intention, and run sessions
(start, end, and the guides that structure them).

Spoken sessions (Plus): the sitting runs as a live-voice mentor conversation.
Each utterance the user speaks becomes a turn on the session's linked
conversation — prepared here (gates, guide/step context, message persist) and
streamed by the chat module's SSE engine (services/chat.py::stream_turn)."""
import calendar as calendar_mod
import uuid
from datetime import date, datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.auth import ensure_verified, require_plus
from app.core.config import get_settings
from app.crud import conversation as conversation_crud
from app.crud import journal as journal_crud
from app.crud import practice as practice_crud
from app.models import Message, User
from app.schemas.journal import JournalEntryOut
from app.schemas.passage import PassageOut
from app.schemas.practice import (
    CalendarDayOut,
    DayDetailOut,
    GuideOut,
    GuideStepOut,
    IntentionOut,
    NoteWithPassageOut,
    ReadWorkOut,
    SessionOut,
    SessionTurnIn,
)
from app.services import audio as audio_service
from app.services import daily as daily_service
from app.services.breakdown import breakdown_for

# A session left open (never ended) records nothing; one ended after a very
# long gap is clamped so a forgotten tab doesn't record an eight-hour sit.
MAX_SESSION_SECONDS = 4 * 60 * 60

# The guides are content, not configuration — two classic Stoic exercises.
# Step keys are what clients report back in steps_completed.
GUIDES: list[GuideOut] = [
    GuideOut(
        key="morning",
        title="Morning preparation",
        tagline="Meet the day before it meets you.",
        steps=[
            GuideStepOut(
                key="passage",
                kind="passage",
                title="Today's passage",
                body="Listen or read slowly. Let one line stay with you.",
            ),
            GuideStepOut(
                key="rehearse",
                kind="prompt",
                title="Rehearse the day",
                body=(
                    "Look ahead at what is coming today. What could test your "
                    "patience, your temper, your honesty? Name it, and decide "
                    "now how the best version of you meets it."
                ),
            ),
            GuideStepOut(
                key="intention",
                kind="prompt",
                title="Set your intention",
                body=(
                    "In one or two sentences: what is the one thing you will "
                    "practice today?"
                ),
            ),
        ],
    ),
    GuideOut(
        key="evening",
        title="Evening review",
        tagline="Seneca's nightly self-examination.",
        steps=[
            GuideStepOut(
                key="badly",
                kind="prompt",
                title="What did I do badly?",
                body=(
                    "Where did you fall short of your own standard today? Name "
                    "it without excuses — and without cruelty. The point is to "
                    "see clearly, not to punish."
                ),
            ),
            GuideStepOut(
                key="well",
                kind="prompt",
                title="What did I do well?",
                body=(
                    "Where did you act as you intended? Give yourself an honest "
                    "account of it; progress counted is progress kept."
                ),
            ),
            GuideStepOut(
                key="undone",
                kind="prompt",
                title="What did I leave undone?",
                body=(
                    "What did you avoid or postpone that mattered? What will "
                    "you do about it tomorrow?"
                ),
            ),
            GuideStepOut(
                key="passage",
                kind="passage",
                title="Close with today's passage",
                body="End with the day's words. Let them settle before sleep.",
            ),
        ],
    ),
]


def list_guides() -> list[GuideOut]:
    return GUIDES


def _guide(key: str | None) -> GuideOut | None:
    return next((g for g in GUIDES if g.key == key), None)


PLUS_MESSAGE = "Spoken sessions are a Plus feature"


def start_session(
    db: Session, user: User, guide: str | None, spoken: bool = False
) -> SessionOut:
    conversation_id = None
    if spoken:
        require_plus(user, PLUS_MESSAGE)
        ensure_verified(user)
        g = _guide(guide)
        if g is None:
            raise HTTPException(422, "Spoken sessions follow a guide")
        today = date.today()
        conversation = conversation_crud.create(
            db,
            title=f"{g.title} — {today:%B} {today.day}",
            user_id=user.id,
            tradition=user.tradition,
        )
        conversation_id = conversation.id
    row = practice_crud.create_session(
        db, user.id, date.today(), guide, conversation_id
    )
    return SessionOut.model_validate(row)


def prepare_spoken_turn(
    db: Session, user: User, session_id: uuid.UUID, req: SessionTurnIn
) -> tuple[uuid.UUID, list[Message], str, str]:
    """Everything before streaming one spoken-session turn, mirroring
    chat's prepare_turn: gates, guide/step resolution, context assembly,
    user-message persist. Closes the request session on the way out — the
    SSE stream must not hold a pool connection."""
    require_plus(user, PLUS_MESSAGE)
    ensure_verified(user)
    row = practice_crud.get_session(db, user.id, session_id)
    if row is None:
        raise HTTPException(404, "Session not found")
    if row.conversation_id is None:
        raise HTTPException(409, "Not a spoken session")
    guide = _guide(row.guide)
    if guide is None:
        raise HTTPException(409, "Session has no guide")
    idx = next(
        (i for i, s in enumerate(guide.steps) if s.key == req.step), None
    )
    if idx is None:
        raise HTTPException(422, "Unknown step")
    conversation = conversation_crud.get(db, row.conversation_id)
    if conversation is None:
        raise HTTPException(404, "Conversation not found")

    context = _spoken_context(db, conversation.tradition, guide, idx, req.probed)
    history = conversation_crud.recent_messages(
        db, conversation.id, get_settings().history_max_messages
    )
    conversation_crud.add_message(db, conversation.id, "user", req.text)

    conversation_id = conversation.id
    tradition = conversation.tradition
    db.close()
    return conversation_id, history, context, tradition


# DRAFT VOICE — the product owner owns the facilitation copy below.
def _spoken_context(
    db: Session, tradition: str, guide: GuideOut, idx: int, probed: bool
) -> str:
    """The per-turn context for a spoken-session turn: the passage and its
    reflection, plus the facilitation frame — which sitting, which step, and
    whether the mentor may still ask its one follow-up here."""
    step = guide.steps[idx]
    nxt = guide.steps[idx + 1] if idx + 1 < len(guide.steps) else None
    daily_row = daily_service.get_or_assign(db, date.today(), tradition)
    p = daily_row.passage
    parts = [
        f"Today's passage — {p.reference} ({p.author}, {p.work}):\n\n{p.text}"
    ]
    breakdown = breakdown_for(db, p, "en")
    if breakdown:
        parts.append(f"Today's reflection on the passage:\n\n{breakdown}")

    lines = [
        f'You are guiding a spoken practice sitting: "{guide.title}" — '
        f"{guide.tagline}",
        "Steps: "
        + "; ".join(
            f"{i + 1}. {s.title}" + (" (current)" if i == idx else "")
            for i, s in enumerate(guide.steps)
        ),
        f"Current step — {step.title}: {step.body}",
        "The person is thinking aloud; their words reach you transcribed, "
        "and your reply is spoken back to them. Respond genuinely to what "
        "they said, in two to five conversational sentences — no lists, no "
        "headings.",
    ]
    if nxt is None:
        lines.append(
            "This is the final step. Do not ask a question — close the "
            "sitting warmly in a sentence or two."
        )
    elif probed:
        lines.append(
            "You have already asked your one follow-up on this step. Do not "
            "ask another question — end by handing them on to the next step, "
            f'"{nxt.title}", in a natural sentence.'
        )
    else:
        lines.append(
            "If they clearly left something important unexamined, you may "
            "end with ONE short follow-up question. Otherwise do not ask a "
            "question — end by handing them on to the next step, "
            f'"{nxt.title}", in a natural sentence.'
        )
    parts.append("\n".join(lines))
    return "\n\n---\n\n".join(parts)


def spoken_step_audio(
    user: User, guide_key: str, step_key: str, voice: str
) -> tuple[bytes, str]:
    """The mentor's scripted line opening a step of a spoken session — the
    step's title and guidance in the mentor's speaking voice. Static content,
    synthesized on demand; the route's cache header covers daily reuse."""
    require_plus(user, PLUS_MESSAGE)
    guide = _guide(guide_key)
    step = next(
        (s for s in (guide.steps if guide else []) if s.key == step_key), None
    )
    if step is None:
        raise HTTPException(404, "Step not found")
    return audio_service.synthesize(
        f"{step.title}. {step.body}",
        audio_service.resolve_voice(voice),
        instructions=audio_service.MENTOR_INSTRUCTIONS,
    )


def end_session(
    db: Session, user: User, session_id: uuid.UUID, steps_completed: list[str]
) -> SessionOut:
    row = practice_crud.get_session(db, user.id, session_id)
    if row is None:
        raise HTTPException(404, "Session not found")
    if row.ended_at is None:
        now = datetime.now(timezone.utc)
        elapsed = int((now - row.started_at).total_seconds())
        row.ended_at = now
        row.duration_seconds = max(0, min(elapsed, MAX_SESSION_SECONDS))
        row.steps_completed = steps_completed
        db.commit()
        db.refresh(row)
    # Already ended: return as-is — a double tap on "End" shouldn't error.
    return SessionOut.model_validate(row)


def get_intention(db: Session, user: User) -> IntentionOut | None:
    row = practice_crud.get_intention(db, user.id)
    return IntentionOut.model_validate(row) if row is not None else None


def set_intention(
    db: Session, user: User, minutes_per_day: int, time_of_day: time | None
) -> IntentionOut:
    row = practice_crud.upsert_intention(db, user.id, minutes_per_day, time_of_day)
    return IntentionOut.model_validate(row)


def month_view(db: Session, user: User, year: int, month: int) -> list[CalendarDayOut]:
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        raise HTTPException(422, "Invalid year or month")
    start = date(year, month, 1)
    days_in_month = calendar_mod.monthrange(year, month)[1]
    end = (
        date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    )

    daily = practice_crud.daily_references(db, start, end, user.tradition)
    journal = practice_crud.journal_counts(db, user.id, start, end)
    notes = practice_crud.note_counts(db, user.id, start, end)
    reads = practice_crud.read_counts(db, user.id, start, end)
    sessions = practice_crud.session_aggregates(db, user.id, start, end)

    return [
        CalendarDayOut(
            date=d,
            daily_reference=daily.get(d),
            journal_count=journal.get(d, 0),
            note_count=notes.get(d, 0),
            read_count=reads.get(d, 0),
            session_count=sessions.get(d, (0, 0))[0],
            practice_seconds=sessions.get(d, (0, 0))[1],
        )
        for d in (date(year, month, n) for n in range(1, days_in_month + 1))
    ]


def day_detail(db: Session, user: User, on: date) -> DayDetailOut:
    if not 2000 <= on.year <= 2100:
        raise HTTPException(422, "Invalid date")
    # Any date can be viewed; its passage is assigned on first request and
    # permanent from then on, so future days show what the landing page will.
    daily_row = daily_service.get_or_assign(db, on, user.tradition)
    return DayDetailOut(
        date=on,
        daily=PassageOut.model_validate(daily_row.passage),
        journal=[
            JournalEntryOut.model_validate(e)
            for e in journal_crud.for_user_on(db, user.id, on)
        ],
        notes=[
            NoteWithPassageOut.model_validate(row, from_attributes=True)
            for row in practice_crud.notes_on(db, user.id, on)
        ],
        reads=[
            ReadWorkOut.model_validate(row, from_attributes=True)
            for row in practice_crud.reads_on(db, user.id, on)
        ],
        sessions=[
            SessionOut.model_validate(row)
            for row in practice_crud.sessions_on(db, user.id, on)
        ],
    )
