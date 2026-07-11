"""Dashboard aggregation: the learner's progress and stats surface."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.timeutil import aware as _aware, utcnow as _utcnow
from app.models import Item, ReviewEvent, User, UserItemState
from app.srs import engine
from app.services.learning import _level_guru_count, _level_total, maybe_level_up




def _srs_band(stage: int) -> str:
    return engine.band(stage)


def _streak(dates: set, today) -> int:
    one = timedelta(days=1)
    if today in dates:
        cur = today
    elif (today - one) in dates:
        cur = today - one
    else:
        return 0
    streak = 0
    while cur in dates:
        streak += 1
        cur -= one
    return streak


def build_dashboard(db: Session, user: User, now: datetime | None = None) -> dict:
    now = now or _utcnow()

    # Lazy level-up. Reviews normally trigger promotion, but entitlement can
    # change between reviews (an upgrade to premium), which would otherwise
    # leave the user stuck on a cleared level until their next completed pass.
    # Advancing here also makes the response's `cleared` flag unambiguous:
    # when it is true, the user is blocked by the free-tier wall.
    leveled = False
    while maybe_level_up(db, user):
        leveled = True
    if leveled:
        db.commit()

    level = user.current_level

    # Level progress.
    total = _level_total(db, level)
    guru = _level_guru_count(db, user.id, level)
    fraction = (guru / total) if total else 0.0

    # SRS band counts via a single grouped query.
    counts = {"apprentice": 0, "guru": 0, "master": 0, "enlightened": 0, "burned": 0}
    for stage, n in db.execute(
        select(UserItemState.srs_stage, func.count())
        .where(UserItemState.user_id == user.id)
        .group_by(UserItemState.srs_stage)
    ).all():
        counts[_srs_band(stage)] += n

    frozen = bool((user.settings or {}).get("vacation_started_at"))
    horizon = now + timedelta(hours=24)

    def _due_count(lo: datetime | None, hi: datetime | None) -> int:
        conds = [
            UserItemState.user_id == user.id,
            UserItemState.available_at.is_not(None),
            UserItemState.srs_stage < engine.BURNED,
        ]
        if lo is not None:
            conds.append(UserItemState.available_at > lo)
        if hi is not None:
            conds.append(UserItemState.available_at <= hi)
        return db.scalar(select(func.count()).select_from(UserItemState).where(and_(*conds))) or 0

    reviews_due = 0 if frozen else _due_count(None, now)
    reviews_upcoming_24h = 0 if frozen else _due_count(now, horizon)

    leech_count = db.scalar(
        select(func.count()).select_from(UserItemState).where(
            and_(UserItemState.user_id == user.id, UserItemState.is_leech.is_(True))
        )
    ) or 0

    # Lessons available: unlocked, not yet started (uncapped count).
    started = select(UserItemState.item_id).where(UserItemState.user_id == user.id)
    lessons_available = db.scalar(
        select(func.count())
        .select_from(Item)
        .where(and_(Item.level <= level, Item.id.not_in(started)))
    ) or 0

    # Accuracy via aggregate counts.
    total_reviews = db.scalar(
        select(func.count()).select_from(ReviewEvent).where(ReviewEvent.user_id == user.id)
    ) or 0
    correct = db.scalar(
        select(func.count())
        .select_from(ReviewEvent)
        .where(and_(ReviewEvent.user_id == user.id, ReviewEvent.correct.is_(True)))
    ) or 0
    accuracy = (correct / total_reviews) if total_reviews else None

    # Streak from the set of active days (fetch timestamps only, not full rows).
    rows = db.execute(
        select(ReviewEvent.answered_at).where(ReviewEvent.user_id == user.id)
    ).all()
    dates = {_aware(t).date() for (t,) in rows if t}
    streak = _streak(dates, now.date())

    return {
        "current_level": level,
        "frozen": frozen,
        "level_progress": {
            "level": level,
            "guru": guru,
            "total": total,
            "threshold": engine.unlock_threshold(level),
            "fraction": round(fraction, 3),
            "cleared": engine.level_is_cleared(guru, total, level),
        },
        "srs_counts": counts,
        "lessons_available": lessons_available,
        "reviews_due": reviews_due,
        "reviews_upcoming_24h": reviews_upcoming_24h,
        "streak": streak,
        "accuracy": round(accuracy, 3) if accuracy is not None else None,
        "total_reviews": total_reviews,
        "leech_count": leech_count,
    }


def build_forecast(db: Session, user: User, now: datetime | None = None) -> dict:
    """Upcoming review load. Buckets are rolling windows from now (hour 0 is
    the next 60 minutes, day 0 is the next 24 hours), which keeps the math
    timezone-free; the client labels them relatively (+1h, +2d)."""
    now = now or _utcnow()
    frozen = bool((user.settings or {}).get("vacation_started_at"))

    due_now = 0
    hourly = [0] * 24
    daily = [0] * 7
    if not frozen:
        rows = db.execute(
            select(UserItemState.available_at).where(
                and_(
                    UserItemState.user_id == user.id,
                    UserItemState.available_at.is_not(None),
                    UserItemState.srs_stage < engine.BURNED,
                )
            )
        ).all()
        for (t,) in rows:
            if t is None:
                continue
            t = _aware(t)
            if t <= now:
                due_now += 1
                continue
            hours = (t - now).total_seconds() / 3600
            if hours < 24:
                hourly[int(hours)] += 1
            if hours < 24 * 7:
                daily[int(hours // 24)] += 1

    return {"due_now": due_now, "frozen": frozen, "hourly": hourly, "daily": daily}
