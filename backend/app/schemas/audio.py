"""Narration shapes. The audio itself streams as bytes (audio/mpeg), not
JSON — only the voice menu needs a schema."""
from pydantic import BaseModel


class VoiceOut(BaseModel):
    id: str
    description: str
    default: bool
