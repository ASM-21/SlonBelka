"""
Web push delivery and the review-reminder sweep.

Requires VAPID keys in settings; without them configured() is False and
nothing sends. Delivery uses pywebpush against the stored subscriptions.
Subscriptions rejected with 404 or 410 are pruned (the browser dropped them).

The sweep is triggered externally (POST /internal/push/run from a cron), not
by an in-process scheduler: a background thread would double-send the moment
the backend scales past one instance. Idempotence across close-together runs
comes from a per-user cooldown stored in the User.settings JSON under
last_reminder_sent_at (a reserved key, like vacation_started_at).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from pywebpush import WebPushException, webpush
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import PushSubscription, User, UserItemState
from app.services.account import VACATION_KEY
from app.srs import engine
from app.timeutil import aware as _aware, utcnow as _utcnow

logger = logging.getLogger(__name__)

REMINDER_KEY = "last_reminder_sent_at"
REMINDER_COOLDOWN = timedelta(hours=6)


def configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def send_to_subscription(db: Session, sub: PushSubscription, payload: dict) -> bool:
    """Send one payload to one subscription. Prunes dead subscriptions."""
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": sub.keys},
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
        return True
    except WebPushException as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code in (404, 410):
            # The browser dropped this subscription; forget it.
            db.delete(sub)
            db.commit()
        else:
            logger.warning("Push to subscription %s failed: %s", sub.id, exc)
        return False


def send_to_user(db: Session, user_id: int, payload: dict) -> int:
    subs = db.scalars(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    ).all()
    return sum(1 for sub in subs if send_to_subscription(db, sub, payload))


def send_review_reminders(db: Session) -> dict:
    """Notify every subscribed user with due reviews, at most once per
    cooldown window. Returns counts for the trigger endpoint's response."""
    if not configured():
        return {"sent": 0, "skipped": 0, "checked": 0, "configured": False}

    now = _utcnow()

    # Users with at least one subscription and at least one due, unburned item.
    due_counts = dict(
        db.execute(
            select(UserItemState.user_id, func.count())
            .where(
                and_(
                    UserItemState.available_at.is_not(None),
                    UserItemState.available_at <= now,
                    UserItemState.srs_stage < engine.BURNED,
                )
            )
            .group_by(UserItemState.user_id)
        ).all()
    )
    subscribed_ids = set(
        db.scalars(select(PushSubscription.user_id).distinct()).all()
    )

    sent = skipped = 0
    for user_id in sorted(subscribed_ids & set(due_counts)):
        user = db.get(User, user_id)
        if user is None:
            continue
        user_settings = user.settings or {}
        if user_settings.get(VACATION_KEY):
            skipped += 1
            continue
        last_raw = user_settings.get(REMINDER_KEY)
        if last_raw:
            last = _aware(datetime.fromisoformat(last_raw))
            if now - last < REMINDER_COOLDOWN:
                skipped += 1
                continue

        n = due_counts[user_id]
        payload = {
            "title": "Slonbelka",
            "body": f"You have {n} review{'s' if n != 1 else ''} due",
            "count": n,  # mirrored onto the app icon badge by the service worker
        }
        if send_to_user(db, user_id, payload) > 0:
            updated = dict(user_settings)
            updated[REMINDER_KEY] = now.isoformat()
            user.settings = updated  # reassign so SQLAlchemy sees the JSON change
            db.commit()
            sent += 1

    return {
        "sent": sent,
        "skipped": skipped,
        "checked": len(subscribed_ids & set(due_counts)),
        "configured": True,
    }
