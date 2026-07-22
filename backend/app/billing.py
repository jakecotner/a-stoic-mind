"""Billing surface (MONETIZATION.md slices 2–3): summary, Stripe Checkout,
customer portal, and the webhook that owns users.tier.

The response shape mirrors the frontend's BillingSummary (frontend/src/api.ts)
— it shipped ahead of this endpoint and falls back to a bare free tier when
the call fails, so changes here must stay backward-compatible with that type.

Stripe design (§5 slice 3): Checkout + portal sessions only, no custom billing
UI. The webhook mirrors subscription state onto the user row (tier,
plus_renews_at, plus_cancel_at_period_end) so reads never call Stripe. With no
Stripe keys configured, checkout/portal return 503 and the frontend keeps
showing "payments aren't live yet".
"""
import json
import logging
import uuid
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_active_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.usage import reflection_turns_this_month

logger = logging.getLogger("stoa")

router = APIRouter(prefix="/api/billing", tags=["billing"])

# Subscription statuses that grant Plus. past_due keeps access while Stripe's
# smart retries run — access ends when the subscription is deleted, not when
# a single charge fails.
PLUS_STATUSES = {"trialing", "active", "past_due"}


class Reflections(BaseModel):
    used: int
    limit: int


class BillingSummary(BaseModel):
    tier: str
    reflections: Reflections | None  # null = uncapped (plus, superuser)
    renews_at: str | None
    cancel_at_period_end: bool = False


@router.get("/summary", response_model=BillingSummary)
def billing_summary(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
) -> BillingSummary:
    if user.is_superuser or user.tier == "plus":
        return BillingSummary(
            tier=user.tier,
            reflections=None,
            renews_at=(
                user.plus_renews_at.date().isoformat()
                if user.plus_renews_at
                else None
            ),
            cancel_at_period_end=user.plus_cancel_at_period_end,
        )
    return BillingSummary(
        tier=user.tier,
        reflections=Reflections(
            used=reflection_turns_this_month(db, user.id),
            limit=get_settings().free_tier_monthly_turns,
        ),
        renews_at=None,
    )


def _require_stripe() -> Settings:
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Payments aren't configured yet")
    stripe.api_key = settings.stripe_secret_key
    return settings


def _base_url(request: Request) -> str:
    """Origin for Stripe redirect URLs: configured value in production;
    otherwise the request's Origin (the Vite dev origin, since the browser
    calls through the dev proxy), then the request base as a last resort."""
    settings = get_settings()
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    return str(request.base_url).rstrip("/")


class CheckoutRequest(BaseModel):
    plan: str  # "annual" | "monthly"


@router.post("/checkout")
def create_checkout(
    req: CheckoutRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    settings = _require_stripe()
    price = {
        "annual": settings.stripe_price_annual,
        "monthly": settings.stripe_price_monthly,
    }.get(req.plan)
    if req.plan not in ("annual", "monthly"):
        raise HTTPException(422, 'plan must be "annual" or "monthly"')
    if price is None:
        raise HTTPException(503, "Payments aren't configured yet")
    if user.tier == "plus":
        raise HTTPException(409, "Already subscribed")

    row = db.get(User, user.id)
    try:
        # One Stripe customer per user, created lazily and persisted before
        # the session so the webhook can always map customer → user.
        if row.stripe_customer_id is None:
            customer = stripe.Customer.create(
                email=row.email, metadata={"user_id": str(row.id)}
            )
            row.stripe_customer_id = customer.id
            db.commit()

        base = _base_url(request)
        params: dict = dict(
            mode="subscription",
            customer=row.stripe_customer_id,
            line_items=[{"price": price, "quantity": 1}],
            client_reference_id=str(row.id),
            success_url=f"{base}/?checkout=success",
            cancel_url=f"{base}/?checkout=cancelled",
            allow_promotion_codes=True,
        )
        if settings.stripe_trial_days > 0:
            params["subscription_data"] = {
                "trial_period_days": settings.stripe_trial_days
            }
        session = stripe.checkout.Session.create(**params)
    except stripe.StripeError:
        logger.exception("stripe checkout session failed")
        raise HTTPException(502, "Could not start checkout — try again shortly")
    return {"url": session.url}


@router.post("/portal")
def billing_portal(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    _require_stripe()
    row = db.get(User, user.id)
    if row.stripe_customer_id is None:
        raise HTTPException(409, "No billing account for this user")
    try:
        session = stripe.billing_portal.Session.create(
            customer=row.stripe_customer_id,
            return_url=_base_url(request) + "/",
        )
    except stripe.StripeError:
        logger.exception("stripe portal session failed")
        raise HTTPException(502, "Could not open the billing portal — try again shortly")
    return {"url": session.url}


def _user_for_customer(
    db: Session, customer_id: str | None, fallback_user_id: str | None = None
) -> User | None:
    """Map a Stripe customer to a user; fall back to the checkout session's
    client_reference_id (adopting the customer id) for resilience if the
    customer was created outside create_checkout."""
    if customer_id:
        user = db.scalar(
            select(User).where(User.stripe_customer_id == customer_id)
        )
        if user is not None:
            return user
    if fallback_user_id:
        try:
            uid = uuid.UUID(fallback_user_id)
        except ValueError:
            return None
        user = db.get(User, uid)
        if user is not None and user.stripe_customer_id is None and customer_id:
            user.stripe_customer_id = customer_id
        return user
    return None


def _subscription_period_end(sub: dict) -> datetime | None:
    # current_period_end lives on the subscription in older API versions and
    # on its items in 2025+ ("basil") versions; accept either.
    ts = sub.get("current_period_end")
    if ts is None:
        items = (sub.get("items") or {}).get("data") or []
        if items:
            ts = items[0].get("current_period_end")
    return datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None


def _apply_subscription(db: Session, sub: dict) -> None:
    user = _user_for_customer(db, sub.get("customer"))
    if user is None:
        logger.warning(
            "stripe webhook: no user for customer %s", sub.get("customer")
        )
        return
    if sub.get("status") in PLUS_STATUSES:
        user.tier = "plus"
        user.plus_renews_at = _subscription_period_end(sub)
        user.plus_cancel_at_period_end = bool(sub.get("cancel_at_period_end"))
    else:
        user.tier = "free"
        user.plus_renews_at = None
        user.plus_cancel_at_period_end = False
    db.commit()


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    if not (settings.stripe_secret_key and settings.stripe_webhook_secret):
        raise HTTPException(503, "Payments aren't configured yet")
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        # construct_event is used purely for signature verification; handlers
        # below read the plain-JSON payload so they don't depend on the SDK's
        # StripeObject accessor quirks (no .get in current versions).
        stripe.Webhook.construct_event(
            payload, signature, settings.stripe_webhook_secret
        )
        event = json.loads(payload)
        kind = event["type"]
        obj = event["data"]["object"]
    except Exception:  # bad signature or a payload that isn't a Stripe event
        raise HTTPException(400, "Invalid webhook payload or signature")
    if kind == "checkout.session.completed":
        # The subscription.* events carry the authoritative state; this one
        # exists to adopt the customer id via client_reference_id and flip
        # the tier promptly so the success redirect sees Plus.
        user = _user_for_customer(
            db, obj.get("customer"), obj.get("client_reference_id")
        )
        if user is not None and obj.get("mode") == "subscription":
            user.tier = "plus"
            db.commit()
        elif user is None:
            logger.warning(
                "stripe webhook: checkout completed for unknown customer %s",
                obj.get("customer"),
            )
    elif kind in (
        "customer.subscription.created",
        "customer.subscription.updated",
    ):
        _apply_subscription(db, obj)
    elif kind == "customer.subscription.deleted":
        user = _user_for_customer(db, obj.get("customer"))
        if user is not None:
            user.tier = "free"
            user.plus_renews_at = None
            user.plus_cancel_at_period_end = False
            db.commit()
    return {"received": True}
