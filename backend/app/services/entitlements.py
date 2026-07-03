"""
Entitlements.

A user is premium while their subscription is active or trialing. Free users can
learn and progress through the free levels (config `free_level_limit`) and hit a
paywall beyond that. Reviews of already-learned items are never gated.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Subscription, User

PREMIUM_STATUSES = {"active", "trialing"}


def get_subscription(db: Session, user_id: int) -> Subscription | None:
    return db.scalar(select(Subscription).where(Subscription.user_id == user_id))


def is_premium(db: Session, user: User) -> bool:
    sub = get_subscription(db, user.id)
    return sub is not None and sub.status in PREMIUM_STATUSES


def accessible_level(db: Session, user: User) -> int:
    """Highest level the user may access. Free users are capped at the free limit."""
    if is_premium(db, user):
        return user.current_level
    return min(user.current_level, settings.free_level_limit)


def can_advance_to(db: Session, user: User, next_level: int) -> bool:
    """Whether the user is allowed to level up into `next_level`."""
    if next_level <= settings.free_level_limit:
        return True
    return is_premium(db, user)
