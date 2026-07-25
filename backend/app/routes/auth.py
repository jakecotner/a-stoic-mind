"""Auth routes: the fastapi-users routers plus /me endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import (
    auth_backend,
    bearer_backend,
    current_active_user,
    fastapi_users,
)
from app.core.db import get_db
from app.models import User
from app.schemas.user import UserCreate, UserRead
from app.services import user as user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWT in an httponly cookie for the web app, bearer token for a future
# mobile app (see app/core/auth.py).
router.include_router(fastapi_users.get_auth_router(auth_backend))
router.include_router(fastapi_users.get_auth_router(bearer_backend), prefix="/bearer")
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))
# Password reset: /api/auth/forgot-password (always 202) + /reset-password.
# The email itself is sent from UserManager.on_after_forgot_password.
router.include_router(fastapi_users.get_reset_password_router())
# Email verification: /api/auth/request-verify-token (always 202) +
# /api/auth/verify. Always wired; whether anything ENFORCES verification is
# the REQUIRE_EMAIL_VERIFICATION setting (see core/config.py) — off means
# registration stays frictionless and these endpoints just sit dark.
router.include_router(fastapi_users.get_verify_router(UserRead))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(current_active_user)):
    return user


@router.delete("/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
):
    user_service.delete_account(db, user)
