"""Claude integration for the chat endpoint.

The system prompt is byte-stable and carries a cache_control breakpoint —
prompt caching is a prefix match, so all volatile content (retrieved context,
conversation history) goes in the messages array after it.
"""

from collections.abc import Iterator

import anthropic

from app.core.config import get_settings
from app.models import Message

# Replace with the product's actual voice. Keep it byte-stable at runtime:
# anything volatile (user context, retrieved documents) belongs in the
# messages array, not here, or the prompt-cache prefix breaks.
SYSTEM_PROMPT = """\
You are the assistant behind "A Stoic Mind". Be warm, direct, and concrete.
Keep replies to a few short paragraphs unless the person asks for depth.
"""


def stream_reply(
    history: list[Message],
    user_message: str,
) -> Iterator[str | anthropic.types.Message]:
    """Yield text deltas, then the final anthropic Message object last."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    messages: list[dict] = [
        {"role": m.role, "content": m.content} for m in history
    ]
    messages.append({"role": "user", "content": user_message})

    with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=settings.chat_max_tokens,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
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
