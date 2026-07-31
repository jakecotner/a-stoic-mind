"""Claude integration: passage breakdowns and journal-entry reflections.

System prompts are byte-stable and carry a cache_control breakpoint —
prompt caching is a prefix match, so all volatile content (the passage,
the entry text) goes in the messages array after it.
"""

import anthropic

from app.core.config import get_settings
from app.models import Passage

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
