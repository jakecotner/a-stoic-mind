"""Narration shapes. The audio itself streams as bytes (audio/mpeg), not
JSON — the voice menu and the click-to-jump timing map need schemas."""
from pydantic import BaseModel


class VoiceOut(BaseModel):
    id: str
    description: str
    default: bool


class TimingsOut(BaseModel):
    # starts[i] = seconds into the recording where the i-th whitespace token
    # of the narrated text begins. The reader uses it to jump narration to a
    # clicked word.
    starts: list[float]
