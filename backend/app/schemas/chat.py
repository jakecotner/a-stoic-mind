"""Chat shapes: the turn request, conversation listings, and one thread."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None
    # Applied only when this turn CREATES the conversation (conversation_id
    # is null); toggling an existing conversation is PATCH /conversations/{id}.
    share_journal: bool = False


class ConversationUpdate(BaseModel):
    share_journal: bool


# Response models are kept precise (Literal unions, required fields) because
# they define the OpenAPI schema the frontend's TypeScript types are generated
# from — see scripts/export_openapi.py.
class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    share_journal: bool
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    share_journal: bool
    created_at: datetime
    messages: list[MessageOut]
