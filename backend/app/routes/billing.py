"""Billing routes. Thin: extract HTTP-level inputs (origin, raw webhook
body + signature) and delegate to services/billing.py."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.auth import current_active_user, current_verified_user
from app.core.config import get_settings
from app.core.db import get_db
from app.models import User
from app.schemas.billing import BillingSummary, CheckoutRequest
from app.services import billing as billing_service

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _base_url(request: Request) -> str:
    """Origin for Stripe redirect URLs: configured value in production;
    otherwise the request's Origin (the Next dev origin, since the browser
    calls through the rewrite proxy), then the request base as a last
    resort."""
    settings = get_settings()
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    return str(request.base_url).rstrip("/")


@router.get("/summary", response_model=BillingSummary)
def billing_summary(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
) -> BillingSummary:
    return billing_service.summary(db, user)


@router.post("/checkout")
def create_checkout(
    req: CheckoutRequest,
    request: Request,
    db: Session = Depends(get_db),
    # verified gate: no-op unless REQUIRE_EMAIL_VERIFICATION is on
    user: User = Depends(current_verified_user),
) -> dict:
    url = billing_service.create_checkout(db, user, req.plan, _base_url(request))
    return {"url": url}


@router.post("/portal")
def billing_portal(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    url = billing_service.create_portal(db, user, _base_url(request))
    return {"url": url}


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    billing_service.handle_webhook(db, payload, signature)
    return {"received": True}
