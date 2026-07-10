"""
Email delivery.

With RESEND_API_KEY set, messages go out through the Resend HTTP API. Without
it (dev, tests), messages land in an in-memory outbox and are printed, so the
flow is visible with zero setup. The raw token sits on the outbox record for
test convenience only; a real send only ever puts it inside a link in the body.

Send failures are logged and swallowed on purpose: registration and
forgot-password must not 500 on a provider blip, and forgot-password returns
200 for unknown emails, so raising here would open an account-probing side
channel. The user-facing retry for verification is /auth/resend-verification.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"

_outbox: list[dict] = []


def _deliver(to: str, subject: str, body: str, token: str | None) -> None:
    if settings.resend_api_key:
        try:
            r = httpx.post(
                _RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to],
                    "subject": subject,
                    "text": body,
                },
                timeout=10,
            )
            if r.status_code >= 400:
                logger.error("Resend rejected email to %s: %s %s", to, r.status_code, r.text)
        except httpx.HTTPError:
            logger.error("Resend send to %s failed", to, exc_info=True)
        return
    _outbox.append({"to": to, "subject": subject, "body": body, "token": token})
    print(f"[email] to={to} subject={subject!r}")


def get_outbox() -> list[dict]:
    return _outbox


def clear_outbox() -> None:
    _outbox.clear()


# Links are query params on the root URL: the SPA has no path routing, so
# App.tsx reads these params on mount (frontend/src/lib/urlParams.ts). A path
# like /verify-email would 404 on the static deploy.


def send_verification_email(to: str, token: str) -> None:
    link = f"{settings.frontend_origin}/?verify={token}"
    _deliver(to, "Verify your Slonbelka email", f"Confirm your email: {link}", token)


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{settings.frontend_origin}/?reset={token}"
    _deliver(to, "Reset your Slonbelka password", f"Reset your password: {link}", token)
