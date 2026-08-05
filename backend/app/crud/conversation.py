"""DB access for conversations and messages. Functions take a Session and
return ORM objects; no HTTP concepts. Writes commit unless noted."""
import uuid

from sqlalchemy import delete as sa_delete, select
from sqlalchemy.orm import Session

from app.models import Conversation, Message


def get(db: Session, conversation_id: uuid.UUID) -> Conversation | None:
    return db.get(Conversation, conversation_id)


def list_for_user(db: Session, user_id: uuid.UUID) -> list[Conversation]:
    return list(
        db.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.created_at.desc())
        )
    )


def create(
    db: Session,
    title: str,
    user_id: uuid.UUID | None,
    share_journal: bool = False,
    tradition: str = "stoicism",
) -> Conversation:
    conversation = Conversation(
        title=title,
        user_id=user_id,
        # Journal sharing needs a journal: anonymous conversations stay off.
        share_journal=share_journal if user_id is not None else False,
        tradition=tradition,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def set_share_journal(
    db: Session, conversation: Conversation, share_journal: bool
) -> Conversation:
    conversation.share_journal = share_journal
    db.commit()
    db.refresh(conversation)
    return conversation


def recent_messages(
    db: Session, conversation_id: uuid.UUID, limit: int
) -> list[Message]:
    """The newest `limit` messages, returned oldest-first."""
    return list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
    )[::-1]


def add_message(
    db: Session, conversation_id: uuid.UUID, role: str, content: str
) -> Message:
    message = Message(conversation_id=conversation_id, role=role, content=content)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def get_message(db: Session, message_id: uuid.UUID) -> Message | None:
    return db.get(Message, message_id)


def delete(db: Session, conversation: Conversation) -> None:
    db.delete(conversation)
    db.commit()


def delete_all_for_user(db: Session, user_id: uuid.UUID) -> None:
    """Does NOT commit — callers batch this with the user-row delete
    (see app/services/user.py)."""
    db.execute(sa_delete(Conversation).where(Conversation.user_id == user_id))
