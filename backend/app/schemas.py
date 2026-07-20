import uuid
from datetime import datetime

from fastapi_users import schemas as fastapi_users_schemas
from pydantic import BaseModel, ConfigDict, Field


class UserRead(fastapi_users_schemas.BaseUser[uuid.UUID]):
    pass


class UserCreate(fastapi_users_schemas.BaseUserCreate):
    pass


class UserUpdate(fastapi_users_schemas.BaseUserUpdate):
    pass


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None
    # For a NEW conversation: seed it with the passage + reflection the user
    # was shown (the daily prompt), so history stays coherent.
    seed_passage_id: int | None = None
    # For a NEW conversation: anchor it as the reflection thread under this
    # journal entry (must belong to the requesting user).
    note_id: uuid.UUID | None = None


class PassageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: str
    work: str
    reference: str
    translator: str
    text: str


class WorkOut(BaseModel):
    work: str
    author: str
    translator: str
    passage_count: int


class TocSection(BaseModel):
    """One major division of a work (Book / Letter / Chapter)."""

    label: str
    offset: int  # reading-order offset of the section's first passage
    count: int


class TocOut(BaseModel):
    work: str
    sections: list[TocSection]


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    created_at: datetime


class ReadingPassageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    text: str


class ReadingPageOut(BaseModel):
    work: str
    total: int
    offset: int
    passages: list[ReadingPassageOut]


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    passage_id: int | None = None


class NoteUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class NotePassageRef(BaseModel):
    """Just enough of the linked passage to cite and link back to it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    work: str
    reference: str


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    passage_id: int | None
    content: str
    created_at: datetime
    updated_at: datetime
    passage: NotePassageRef | None = None
    # The entry's reflection-thread conversation, when one exists.
    thread_id: uuid.UUID | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    created_at: datetime
    messages: list[MessageOut] = []
