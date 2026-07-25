"""Create a superuser, or promote an existing account.

    python scripts/create_superuser.py admin@example.com  s3cretpass
    python scripts/create_superuser.py existing@user.com          # promote

Run from backend/ with the venv active and the database up (docker compose
up -d && python -m alembic upgrade head). Superusers bypass the free-tier
turn cap and can call the /api/admin endpoints.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi_users.password import PasswordHelper  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    email = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else None
    if password is not None and len(password) < 8:
        print("Password must be at least 8 characters")
        return 2

    with SessionLocal() as db:
        user = db.scalar(
            select(User).where(func.lower(User.email) == email.lower())
        )
        if user is None:
            if password is None:
                print(f"No account for {email} — pass a password to create one.")
                return 2
            user = User(
                email=email,
                hashed_password=PasswordHelper().hash(password),
                is_active=True,
                is_superuser=True,
                is_verified=True,
            )
            db.add(user)
            action = "created"
        else:
            user.is_superuser = True
            if password is not None:
                user.hashed_password = PasswordHelper().hash(password)
            action = "promoted"
        db.commit()
        print(f"{action} superuser {user.email} ({user.id})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
