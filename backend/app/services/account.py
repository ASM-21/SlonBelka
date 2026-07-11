"""
User settings, vacation (freeze) mode, data export, and account deletion.

Freeze records when the pause started; while frozen, reviews do not surface
(see get_reviews) and the dashboard reports frozen. Unfreezing shifts every
pending review forward by the elapsed time, so nothing is overdue on return.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import and_, delete, select, update
from sqlalchemy.orm import Session

from app.timeutil import aware as _aware, utcnow as _utcnow
from app import security
from app.models import (
    AuthToken,
    Item,
    LessonEvent,
    Mnemonic,
    PushSubscription,
    ReviewEvent,
    Subscription,
    User,
    UserItemState,
    UserSynonym,
)
from app.srs import engine

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "daily_lesson_cap": 15,
    "autoplay_audio": True,
    "keyboard_layout": "jcuken",  # jcuken | phonetic
    "onboarded": False,  # set true once the first-run walkthrough is done
}
ALLOWED_KEYS = set(DEFAULT_SETTINGS)
VACATION_KEY = "vacation_started_at"




def get_settings(user: User) -> dict:
    merged = {**DEFAULT_SETTINGS, **(user.settings or {})}
    merged["frozen"] = bool((user.settings or {}).get(VACATION_KEY))
    return merged


def update_settings(db: Session, user: User, patch: dict) -> dict:
    current = dict(user.settings or {})
    for key, value in patch.items():
        if key in ALLOWED_KEYS and value is not None:
            current[key] = value
    user.settings = current  # reassign so SQLAlchemy detects the JSON change
    db.commit()
    db.refresh(user)
    return get_settings(user)


def set_vacation(db: Session, user: User, on: bool) -> dict:
    settings = dict(user.settings or {})
    started_raw = settings.get(VACATION_KEY)

    if on:
        if not started_raw:
            settings[VACATION_KEY] = _utcnow().isoformat()
            user.settings = settings
            db.commit()
    else:
        if started_raw:
            started = _aware(datetime.fromisoformat(started_raw))
            delta = _utcnow() - started
            states = db.scalars(
                select(UserItemState).where(
                    and_(
                        UserItemState.user_id == user.id,
                        UserItemState.available_at.is_not(None),
                        UserItemState.srs_stage < engine.BURNED,
                    )
                )
            ).all()
            for st in states:
                st.available_at = _aware(st.available_at) + delta
            settings.pop(VACATION_KEY, None)
            user.settings = settings
            db.commit()

    db.refresh(user)
    return {"frozen": bool((user.settings or {}).get(VACATION_KEY))}


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def export_user_data(db: Session, user: User) -> dict:
    """Everything the user owns, keyed by item external_id so the export is
    portable and stable across content reimports (same rule as content
    identity: row ids are internal, external_id is the public key)."""
    ext: dict[int, str] = {
        item_id: external_id
        for item_id, external_id in db.execute(select(Item.id, Item.external_id)).all()
    }

    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))

    states = db.scalars(select(UserItemState).where(UserItemState.user_id == user.id)).all()
    reviews = db.scalars(
        select(ReviewEvent).where(ReviewEvent.user_id == user.id).order_by(ReviewEvent.answered_at)
    ).all()
    lessons = db.scalars(
        select(LessonEvent).where(LessonEvent.user_id == user.id).order_by(LessonEvent.learned_at)
    ).all()
    mnemonics = db.scalars(select(Mnemonic).where(Mnemonic.user_id == user.id)).all()
    synonyms = db.scalars(select(UserSynonym).where(UserSynonym.user_id == user.id)).all()

    return {
        "exported_at": _utcnow().isoformat(),
        "profile": {
            "email": user.email,
            "email_verified": user.email_verified,
            "timezone": user.timezone,
            "current_level": user.current_level,
            "created_at": _iso(user.created_at),
            "tos_accepted_at": _iso(user.tos_accepted_at),
        },
        "settings": get_settings(user),
        "subscription": {
            "status": sub.status if sub else "none",
            "plan": sub.plan if sub else None,
            "current_period_end": _iso(sub.current_period_end) if sub else None,
            "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
        },
        "items": [
            {
                "item_external_id": ext.get(st.item_id),
                "srs_stage": st.srs_stage,
                "stage_name": engine.STAGE_NAMES[st.srs_stage],
                "unlocked_at": _iso(st.unlocked_at),
                "available_at": _iso(st.available_at),
                "passed_at": _iso(st.passed_at),
                "burned_at": _iso(st.burned_at),
                "correct_count": st.correct_count,
                "incorrect_count": st.incorrect_count,
                "correct_streak": st.correct_streak,
                "is_leech": st.is_leech,
                "leech_score": st.leech_score,
                "last_reviewed_at": _iso(st.last_reviewed_at),
            }
            for st in states
        ],
        "review_history": [
            {
                "item_external_id": ext.get(ev.item_id),
                "question_type": ev.question_type,
                "correct": ev.correct,
                "was_override": ev.was_override,
                "srs_before": ev.srs_before,
                "srs_after": ev.srs_after,
                "answered_at": _iso(ev.answered_at),
            }
            for ev in reviews
        ],
        "lesson_history": [
            {"item_external_id": ext.get(ev.item_id), "learned_at": _iso(ev.learned_at)}
            for ev in lessons
        ],
        "mnemonics": [
            {
                "item_external_id": ext.get(m.item_id),
                "meaning_mnemonic": m.meaning_mnemonic,
                "reading_mnemonic": m.reading_mnemonic,
            }
            for m in mnemonics
        ],
        "synonyms": [
            {"item_external_id": ext.get(s.item_id), "text": s.text} for s in synonyms
        ],
    }


def delete_account(db: Session, user: User, password: str) -> bool:
    """Permanently delete the user and everything they own. False means the
    password did not verify and nothing was touched."""
    if not security.verify_password(password, user.password_hash):
        return False

    # Best effort: stop future charges before the local row disappears. A
    # Stripe failure must never block the deletion itself.
    _cancel_stripe_subscription(db, user)

    # Explicit deletes in FK order; the models define no DB-level cascades.
    # Removing every auth token revokes all refresh sessions by construction.
    for model in (
        Mnemonic,
        UserItemState,
        ReviewEvent,
        LessonEvent,
        PushSubscription,
        AuthToken,
        Subscription,
        UserSynonym,
    ):
        db.execute(delete(model).where(model.user_id == user.id))
    # Shared content survives; it just loses the creator reference.
    db.execute(update(Item).where(Item.created_by == user.id).values(created_by=None))
    db.delete(user)
    db.commit()
    return True


def _cancel_stripe_subscription(db: Session, user: User) -> None:
    from app.services import billing

    if not billing.configured():
        return
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if not sub or not sub.stripe_subscription_id or sub.status == "canceled":
        return
    try:
        billing._stripe().Subscription.cancel(sub.stripe_subscription_id)
    except Exception:
        logger.error(
            "Could not cancel Stripe subscription %s during account deletion",
            sub.stripe_subscription_id,
            exc_info=True,
        )
