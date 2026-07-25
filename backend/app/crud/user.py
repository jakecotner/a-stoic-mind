"""DB access for users. (Auth-flow user queries live in the fastapi-users
adapter in app/core/auth.py, which implements that library's protocol.)"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User


def get(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def get_by_stripe_customer(db: Session, customer_id: str) -> User | None:
    return db.scalar(select(User).where(User.stripe_customer_id == customer_id))
