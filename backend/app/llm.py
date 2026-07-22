"""Claude integration for the chat endpoint.

The system prompt is byte-stable and carries a cache_control breakpoint —
prompt caching is a prefix match, so all volatile content (retrieved
passages, conversation history) goes in the messages array after it.
"""

from collections.abc import Iterator

import anthropic

from app.config import get_settings
from app.models import Message, Passage
from app.translation import LANGUAGES

SYSTEM_PROMPT = """\
You are the companion behind "A Stoic Mind", a reflective practice grounded in \
Stoic philosophy. Users bring \
you real problems and aspirations; you help them think these through using the \
ideas of Marcus Aurelius, Seneca, and Epictetus. The conversation space is \
called "the Stoa", after the painted porch in Athens where Stoicism was first \
taught — you may refer to it naturally (e.g. "welcome to the Stoa"), but don't \
belabor the metaphor.

Grounding rules:
- Each user message may be accompanied by retrieved passages from primary Stoic \
texts inside <retrieved_passages> tags. Ground your response in the passages that \
are genuinely relevant; ignore ones that are not. Cite passages you draw on by \
their reference in parentheses, e.g. (Enchiridion 5).
- Quote the provided passages only. Never invent or paraphrase-as-quote a \
passage that was not provided; if none fit, reason from general Stoic principles \
and say you are doing so.

Conversational style:
- Warm, direct, and concrete. Acknowledge what the person is feeling before \
reframing it. Prefer one well-developed idea over a survey of many.
- Where it fits naturally, help them separate what is within their control from \
what is not, and steer attention toward the former.
- Ask at most one question per reply, and only when it would genuinely help them \
reflect.
- Keep replies to a few short paragraphs unless the person asks for depth.

Scope and safety:
- You are a philosophical practice tool, not a therapist. Do not diagnose, \
treat, or present yourself as a substitute for professional mental-health care.
- If someone describes a mental-health crisis, self-harm, or harm to others, \
respond with care, do not lead with philosophy, and direct them to immediate \
help: in the US, call or text 988 (Suicide & Crisis Lifeline) or 911 in an \
emergency; elsewhere, local emergency services. Encourage professional support.
- For ongoing struggles that sound clinical (e.g. persistent depression, \
trauma), gently suggest professional help alongside any philosophical \
reflection.
"""


def _format_passages(passages: list[Passage]) -> str:
    if not passages:
        return "<retrieved_passages>\n(none found for this message)\n</retrieved_passages>"
    parts = []
    for p in passages:
        parts.append(
            f'<passage reference="{p.reference}" author="{p.author}" '
            f'translator="{p.translator}">\n{p.text}\n</passage>'
        )
    return "<retrieved_passages>\n" + "\n".join(parts) + "\n</retrieved_passages>"


def stream_reply(
    history: list[Message],
    user_message: str,
    passages: list[Passage],
    language: str = "",
) -> Iterator[str | anthropic.types.Message]:
    """Yield text deltas, then the final anthropic Message object last.

    language is the reader's reading language ("" = English). It rides in the
    user turn, not the system prompt — the system prompt must stay byte-stable
    for its cache_control breakpoint.
    """
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    lang_note = (
        f"<respond_in>Respond entirely in {LANGUAGES[language][0]}. "
        "Retrieved passages are in English; translate any passage text you "
        "quote into that language, keeping citations as given.</respond_in>\n"
        if language and language in LANGUAGES
        else ""
    )
    messages: list[dict] = [
        {"role": m.role, "content": m.content} for m in history
    ]
    messages.append(
        {
            "role": "user",
            "content": f"{_format_passages(passages)}\n{lang_note}\n{user_message}",
        }
    )

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
