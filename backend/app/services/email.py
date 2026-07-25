"""Transactional email (password resets), via Resend's HTTP API — one POST,
no SDK. With no RESEND_API_KEY configured the message is logged instead of
sent, so dev flows stay inspectable and a production misconfiguration shows
up loudly in the logs rather than as silently-lost mail.

Failures never raise to callers: losing an email must not break the request
that triggered it (the user can always retry a reset).
"""
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger("astoicmind")

RESEND_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, text: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY not set — email NOT sent.\nTo: %s\nSubject: %s\n%s",
            to,
            subject,
            text,
        )
        return
    try:
        resp = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "text": text,
            },
            timeout=10,
        )
        resp.raise_for_status()
    except Exception:
        logger.exception("failed to send email to %s (%s)", to, subject)
