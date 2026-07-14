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
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ReviewEvent, User, UserItemState
from app.srs import engine
from app.timeutil import aware as _aware, utcnow as _utcnow

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
        except Exception:
            # Never let a mail failure break the auth flow that triggered it.
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


def send_digest_email(to: str, reviews_due: int, streak: int) -> None:
    bits = []
    if streak:
        bits.append(f"You are on a {streak}-day streak.")
    if reviews_due:
        bits.append(f"You have {reviews_due} review{'s' if reviews_due != 1 else ''} waiting.")
    else:
        bits.append("You are all caught up on reviews.")
    bits.append(f"Keep going: {settings.frontend_origin}/?goto=reviews")
    _deliver(to, "Your weekly Slonbelka progress", " ".join(bits), None)


def send_weekly_digests(db: Session) -> dict:
    """Email a short progress summary to opted-in, verified users who have
    started learning. Reuses the reminders opt-out and vacation freeze, so a
    user who silenced reminders is not emailed either."""
    from app.services.dashboard import _streak  # local import avoids any cycle

    now = _utcnow()
    users = db.scalars(select(User).where(User.email_verified.is_(True))).all()

    sent = skipped = 0
    for user in users:
        s = user.settings or {}
        if not s.get("reminders_enabled", True) or s.get("vacation_started_at"):
            skipped += 1
            continue

        started = db.scalar(
            select(func.count()).select_from(UserItemState).where(
                UserItemState.user_id == user.id
            )
        ) or 0
        if started == 0:
            skipped += 1  # nothing to report yet
            continue

        reviews_due = db.scalar(
            select(func.count()).select_from(UserItemState).where(
                and_(
                    UserItemState.user_id == user.id,
                    UserItemState.available_at.is_not(None),
                    UserItemState.available_at <= now,
                    UserItemState.srs_stage < engine.BURNED,
                )
            )
        ) or 0

        rows = db.execute(
            select(ReviewEvent.answered_at).where(ReviewEvent.user_id == user.id)
        ).all()
        dates = {_aware(t).date() for (t,) in rows if t}
        streak = _streak(dates, now.date())

        send_digest_email(user.email, reviews_due, streak)
        sent += 1

    return {"sent": sent, "skipped": skipped}
