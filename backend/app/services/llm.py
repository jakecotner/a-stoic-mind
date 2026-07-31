"""Claude integration: the daily-passage breakdown.

System prompts are byte-stable and carry a cache_control breakpoint —
prompt caching is a prefix match, so all volatile content (the passage)
goes in the messages array after it.
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
