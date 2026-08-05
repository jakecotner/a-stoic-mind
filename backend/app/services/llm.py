"""Claude integration: the mentor chat, passage breakdowns, and
journal-entry reflections.

The system prompts (one voice set per tradition) live in the registry —
app/services/tradition.py. They are byte-stable and carry a cache_control
breakpoint — prompt caching is a prefix match, so all volatile content
(the passage, the entry text, chat context and history) goes in the
messages array after it.
"""

from collections.abc import Iterator

import anthropic

from app.core.config import get_settings
from app.models import Message, Passage
from app.services.tradition import DEFAULT_TRADITION, get_tradition


def _system(prompt: str) -> list[dict]:
    return [
        {
            "type": "text",
            "text": prompt,
            "cache_control": {"type": "ephemeral"},
        }
    ]


def stream_reply(
    history: list[Message],
    user_message: str,
    context: str | None = None,
    tradition: str = DEFAULT_TRADITION,
) -> Iterator[str | anthropic.types.Message]:
    """Yield text deltas, then the final anthropic Message object last.

    `context` (the day's passage, opted-in journal excerpts) is injected
    into the current turn only — it is never persisted with the message,
    so history stays clean and today's context is always current.
    `tradition` picks the mentor's voice — the conversation's, not the
    user's current one, so old threads keep the voice they started in.
    """
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    messages: list[dict] = [
        {"role": m.role, "content": m.content} for m in history
    ]
    content = user_message
    if context:
        content = f"<context>\n{context}\n</context>\n\n{user_message}"
    messages.append({"role": "user", "content": content})

    with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=settings.chat_max_tokens,
        system=_system(get_tradition(tradition).mentor_prompt),
        thinking={"type": "adaptive"},
        output_config={"effort": settings.chat_effort},
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text
        yield stream.get_final_message()


def write_breakdown(passage: Passage) -> tuple[str, anthropic.types.Message]:
    """One-shot breakdown of a passage, voiced by the passage's own
    tradition. Returns (text, api message) — the caller records usage from
    the message and caches the text."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # English-original works (translator empty) carry no "trans." credit.
    credit = f" (trans. {passage.translator})" if passage.translator else ""
    parts = [
        f"{passage.reference} — {passage.author}, {passage.work}"
        f"{credit}:\n\n{passage.text}"
    ]
    if passage.original_text:
        parts.append(
            f"Original ({passage.original_language}, "
            f"{passage.original_source}):\n\n{passage.original_text}"
        )
    message = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2048,
        system=_system(get_tradition(passage.tradition).breakdown_prompt),
        messages=[{"role": "user", "content": "\n\n---\n\n".join(parts)}],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    return text, message


def write_reflection(
    entry_content: str,
    passage: Passage | None,
    tradition: str = DEFAULT_TRADITION,
) -> tuple[str, anthropic.types.Message]:
    """One-shot reflection on a journal entry, optionally anchored to the
    passage the entry was written against. `tradition` is the entry's — the
    voice it was written under. Returns (text, api message) — the caller
    records usage and stores the text on the entry."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    parts = []
    if passage is not None:
        parts.append(
            f"The day's passage — {passage.reference} ({passage.author}, "
            f"{passage.work}):\n\n{passage.text}"
        )
    parts.append(f"The journal entry:\n\n{entry_content}")
    message = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=_system(get_tradition(tradition).reflection_prompt),
        messages=[{"role": "user", "content": "\n\n---\n\n".join(parts)}],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    return text, message
