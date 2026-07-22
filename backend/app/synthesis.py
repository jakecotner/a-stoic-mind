"""The Stoa's weekly synthesis of a user's journal (MONETIZATION.md slice 4).

Plus-only from day one — the feature never has to be taken away from free
users. One synthesis per (user, client-local week); regenerated only on
explicit refresh (or a language switch), so the cost per user per week is one
call. Weeks are client-local like passage_reads: the client sends its Monday
date and timezone offset, and the server never reasons about timezones beyond
that arithmetic.
"""
import datetime
import json
import logging
from collections.abc import Iterator

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth import current_active_user
from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import Note, Passage, Synthesis, User
from app.retrieval import search_passages
from app.translation import LANGUAGES
from app.usage import record_usage, require_plus

logger = logging.getLogger("stoa")

router = APIRouter(prefix="/api", tags=["synthesis"])

SYNTHESIS_SYSTEM = """\
You are the voice of "the Stoa" in "A Stoic Mind", a reflective practice
grounded in Stoic philosophy. You are given one week of a person's journal:
freeform entries, and margin notes they left on primary Stoic texts. Write
the week's synthesis — the practice of the evening review, extended to a week.

Reflect their week back to them:
- Name the one or two threads that actually ran through it — recurring
  situations, worries, aspirations — in terms close to their own.
- Notice movement: if later entries meet something differently than earlier
  ones, however slightly, say so. If a thread simply repeats, that is worth
  naming gently too.
- Retrieved passages from the Stoic texts may accompany the journal inside
  <retrieved_passages> tags. Draw on the ones that genuinely speak to the
  week; ignore the rest. Cite any passage you use by its reference in
  parentheses, e.g. (Enchiridion 5), and quote only from provided passages.
- End with a single quiet question or intention worth carrying into the week
  ahead.

Rules: address the person as "you". No headers, no lists, no greeting — begin
with the substance. 200–320 words in a few short paragraphs. Quote their own
words sparingly and exactly. This is a mirror, not a report card: never grade,
score, or scold.

If the week's entries describe a mental-health crisis, self-harm, or harm to
others, set the synthesis aside: respond with care, do not lead with
philosophy, and direct them to immediate help (in the US, call or text 988,
or 911 in an emergency; elsewhere, local emergency services), encouraging
professional support.
"""


def _week_window(
    week_start: datetime.date, tz_offset: int
) -> tuple[datetime.datetime, datetime.datetime]:
    """UTC instants of the client-local week [week_start, +7 days).
    tz_offset is JS getTimezoneOffset(): minutes to ADD to local to get UTC."""
    start = datetime.datetime.combine(
        week_start, datetime.time.min, tzinfo=datetime.timezone.utc
    ) + datetime.timedelta(minutes=tz_offset)
    return start, start + datetime.timedelta(days=7)


def _week_notes(
    db: Session,
    user_id,
    start: datetime.datetime,
    end: datetime.datetime,
) -> list[Note]:
    return list(
        db.scalars(
            select(Note)
            .options(joinedload(Note.passage))
            .where(
                Note.user_id == user_id,
                Note.created_at >= start,
                Note.created_at < end,
            )
            .order_by(Note.created_at.asc())
        )
    )


def _format_week(notes: list[Note], tz_offset: int) -> str:
    """The journal week as the model sees it, dated in the writer's local
    days so 'later in the week' means what the writer meant."""
    parts = []
    for n in notes:
        local = n.created_at - datetime.timedelta(minutes=tz_offset)
        day = local.strftime("%A, %b %d")
        if n.passage is not None:
            head = f"{day} — margin note on {n.passage.reference}"
        else:
            head = f"{day} — journal entry"
        parts.append(f"<entry when=\"{head}\">\n{n.content}\n</entry>")
    return "<journal_week>\n" + "\n".join(parts) + "\n</journal_week>"


def _format_passages(passages: list[Passage]) -> str:
    if not passages:
        return "<retrieved_passages>\n(none)\n</retrieved_passages>"
    parts = [
        f'<passage reference="{p.reference}" author="{p.author}" '
        f'translator="{p.translator}">\n{p.text}\n</passage>'
        for p in passages
    ]
    return "<retrieved_passages>\n" + "\n".join(parts) + "\n</retrieved_passages>"


def _generate_stream(
    notes: list[Note],
    passages: list[Passage],
    tz_offset: int,
    language: str,
) -> Iterator[str | anthropic.types.Message]:
    """Yield synthesis text deltas, then the final Message object last."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    lang_note = (
        f"\nWrite the synthesis entirely in {LANGUAGES[language][0]}. "
        "Retrieved passages are in English; translate anything you quote "
        "from them, keeping citations as given."
        if language
        else ""
    )
    prompt = (
        f"{_format_passages(passages)}\n\n"
        f"{_format_week(notes, tz_offset)}\n{lang_note}"
    )
    with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=3000,
        system=SYNTHESIS_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            yield text
        yield stream.get_final_message()


@router.get("/synthesis/week")
def week_synthesis(
    week_start: datetime.date,
    tz_offset: int = 0,
    language: str = "",
    refresh: bool = False,
    peek: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> StreamingResponse:
    """SSE stream of the week's synthesis.

    Stored one exists (same language, no refresh) → streamed instantly.
    peek=true never generates: it streams a stored synthesis or reports
    {exists: false} in meta, so clients can render on load without paying
    for an LLM call the user didn't ask for.
    """
    require_plus(user, "Weekly synthesis is part of Stoa Plus.")
    if language and language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language code")
    if abs(tz_offset) > 16 * 60:
        raise HTTPException(422, "Implausible timezone offset")

    start, end = _week_window(week_start, tz_offset)
    notes = _week_notes(db, user.id, start, end)
    stored = db.get(Synthesis, (user.id, week_start))

    # peek replays a stored synthesis even across a language switch — stale
    # language beats an empty pane, and the client can refresh to re-language.
    reusable = (
        stored is not None
        and not refresh
        and (peek or stored.language == language)
    )
    generate = not reusable and not peek
    if generate and not notes:
        raise HTTPException(404, "No journal entries in that week")

    meta = {
        "week_start": week_start.isoformat(),
        "exists": stored is not None or generate,
        "cached": reusable,
        "entry_count": len(notes),
        "covered_count": stored.entry_count if reusable else len(notes),
        "generated_at": (
            stored.generated_at.isoformat() if reusable else None
        ),
    }

    # Retrieval keys off the week's own words; generated case only.
    passages = (
        search_passages(db, " ".join(n.content for n in notes)[:4000])
        if generate
        else []
    )
    user_id = user.id
    stored_content = stored.content if reusable else None

    def event_stream() -> Iterator[str]:
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"
        try:
            if stored_content is not None:
                yield f"data: {json.dumps(stored_content)}\n\n"
            elif generate:
                chunks: list[str] = []
                final = None
                for item in _generate_stream(notes, passages, tz_offset, language):
                    if isinstance(item, str):
                        chunks.append(item)
                        yield f"data: {json.dumps(item)}\n\n"
                    else:
                        final = item
                full = "".join(chunks)
                if final is not None:
                    record_usage("weekly_synthesis", final, user_id=user_id)
                if full.strip():
                    # Fresh session: the request-scoped one may be torn down
                    # if the client disconnects mid-stream.
                    with SessionLocal() as write_db:
                        row = write_db.get(Synthesis, (user_id, week_start))
                        if row is None:
                            row = Synthesis(
                                user_id=user_id,
                                week_start=week_start,
                                content=full,
                                model=final.model if final else "",
                                language=language,
                                entry_count=len(notes),
                            )
                            write_db.add(row)
                        else:
                            row.content = full
                            row.model = final.model if final else row.model
                            row.language = language
                            row.entry_count = len(notes)
                        write_db.commit()
        except Exception as exc:
            logger.exception("synthesis stream failed")
            yield f"event: error\ndata: {json.dumps({'error': f'{type(exc).__name__}: {exc}'})}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
