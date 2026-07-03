"""
User settings and vacation (freeze) mode.

Freeze records when the pause started; while frozen, reviews do not surface
(see get_reviews) and the dashboard reports frozen. Unfreezing shifts every
pending review forward by the elapsed time, so nothing is overdue on return.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.timeutil import aware as _aware, utcnow as _utcnow
from app.models import User, UserItemState
from app.srs import engine

DEFAULT_SETTINGS = {
    "daily_lesson_cap": 15,
    "autoplay_audio": True,
    "keyboard_layout": "jcuken",  # jcuken | phonetic
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
