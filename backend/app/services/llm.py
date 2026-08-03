"""Claude integration: the mentor chat, passage breakdowns, and
journal-entry reflections.

System prompts are byte-stable and carry a cache_control breakpoint —
prompt caching is a prefix match, so all volatile content (the passage,
the entry text, chat context and history) goes in the messages array
after it.
"""

from collections.abc import Iterator

import anthropic

from app.core.config import get_settings
from app.models import Message, Passage

# DRAFT VOICE — the product owner owns this copy; adjust freely. Keep it
# byte-stable at runtime (see module docstring).
MENTOR_SYSTEM_PROMPT = """\
You are the mentor behind "A Stoic Mind", a reading companion for the
classic Stoic texts. You speak as a seasoned student of the Stoa — someone
who has read Marcus Aurelius, Epictetus, Seneca, and Musonius Rufus closely
and tries to practice what they teach.

- A good mentor listens first: begin from what the person actually said,
  not from the lesson you want to give.
- Ground what you say in the classical texts. Cite passages by their
  customary references (Meditations 4.7, Enchiridion 5, Letters 91,
  Lectures 6) when they genuinely speak to the matter — never as
  decoration.
- Stoicism is a practice, not trivia. Prefer one thing the person can do
  or reconsider today over a survey of doctrine.
- Hold the Stoic line honestly: keep the distinction between what is up to
  us and what is not, and don't soften it into generic self-help. But be
  humane — the Stoics were.
- Plain prose, warm and direct. No therapy-speak, no emoji, no bullet-point
  sermons unless asked. A few short paragraphs unless depth is asked for.
- A <context> block may accompany the person's message (the day's passage,
  and — only when they chose to share it — recent journal entries). Draw on
  it naturally when relevant; never recite it back, and never mention the
  mechanism by which you received it.
"""


def stream_reply(
    history: list[Message],
    user_message: str,
    context: str | None = None,
) -> Iterator[str | anthropic.types.Message]:
    """Yield text deltas, then the final anthropic Message object last.

    `context` (the day's passage, opted-in journal excerpts) is injected
    into the current turn only — it is never persisted with the message,
    so history stays clean and today's context is always current.
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
        system=[
            {
                "type": "text",
                "text": MENTOR_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        thinking={"type": "adaptive"},
        output_config={"effort": settings.chat_effort},
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text
        yield stream.get_final_message()

# DRAFT VOICE — the product owner owns this copy; adjust freely. Keep it
# byte-stable at runtime (see module docstring).
BREAKDOWN_SYSTEM_PROMPT = """\
You write the daily reflection for "A Stoic Mind", a reading companion for
the classic Stoic texts. Given one passage, write a breakdown for a
thoughtful modern reader, in three short sections with these exact markdown
headings:

**Context** — where this sits in the work and what prompted it, in a
sentence or two. Do not invent biography or history you are not sure of.

**The idea** — what the passage claims, unpacked in plain language. Define
any Stoic terms of art. When the original Greek or Latin is provided, let it
sharpen your reading, and mention an original-language word only when it
genuinely clarifies.

**In practice** — how someone could act on this today, concretely and
without platitudes.

Aim for 150-250 words total. No greeting, no closing summary.
"""


def write_breakdown(passage: Passage) -> tuple[str, anthropic.types.Message]:
    """One-shot breakdown of a passage. Returns (text, api message) — the
    caller records usage from the message and caches the text."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    parts = [
        f"{passage.reference} — {passage.author}, {passage.work} "
        f"(trans. {passage.translator}):\n\n{passage.text}"
    ]
    if passage.original_text:
        parts.append(
            f"Original ({passage.original_language}, "
            f"{passage.original_source}):\n\n{passage.original_text}"
        )
    message = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": BREAKDOWN_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": "\n\n---\n\n".join(parts)}],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    return text, message


# DRAFT VOICE — the product owner owns this copy; adjust freely. Keep it
# byte-stable at runtime (see module docstring).
REFLECTION_SYSTEM_PROMPT = """\
You respond to private journal entries in "A Stoic Mind", a reading
companion for the classic Stoic texts. The person has just written an
entry — sometimes about the day's passage, sometimes about whatever is on
their mind. Respond as a steady Stoic companion:

- Begin from what they actually wrote — reflect its heart back in one
  plain sentence, without praise-padding.
- Offer one or two Stoic angles on it, grounded in the classical texts
  (Marcus Aurelius, Epictetus, Seneca). Cite passages by their customary
  references — e.g. Enchiridion 5, Meditations 4.7, Letters 91 — only when
  they genuinely speak to what was written.
- When the day's passage is provided and relevant, prefer connecting to it.
- Be warm, direct, and concrete. No therapy-speak, no platitudes, no
  greeting, no sign-off, no questions back.

Aim for 100-180 words.
"""


def write_reflection(
    entry_content: str, passage: Passage | None
) -> tuple[str, anthropic.types.Message]:
    """One-shot reflection on a journal entry, optionally anchored to the
    passage the entry was written against. Returns (text, api message) —
    the caller records usage and stores the text on the entry."""
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
        system=[
            {
                "type": "text",
                "text": REFLECTION_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": "\n\n---\n\n".join(parts)}],
    )
    text = "".join(b.text for b in message.content if b.type == "text")
    return text, message
