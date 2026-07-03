"""Progress statistics derived from the review-event log."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import ReviewEvent, UserItemState, User
from app.srs import engine
from app.timeutil import aware, utcnow

WINDOW_DAYS = 30


def _current_streak(active: set[date], today: date) -> int:
    day = today if today in active else today - timedelta(days=1)
    streak = 0
    while day in active:
        streak += 1
        day -= timedelta(days=1)
    return streak


def _longest_streak(active: set[date]) -> int:
    if not active:
        return 0
    days = sorted(active)
    longest = run = 1
    for i in range(1, len(days)):
        run = run + 1 if days[i] - days[i - 1] == timedelta(days=1) else 1
        longest = max(longest, run)
    return longest


def build_stats(db: Session, user: User, now: datetime | None = None) -> dict:
    now = now or utcnow()
    today = now.date()

    # All events, one column pair, aggregated in Python (bounded per user).
    rows = db.execute(
        select(ReviewEvent.answered_at, ReviewEvent.correct).where(ReviewEvent.user_id == user.id)
    ).all()

    total = len(rows)
    correct_total = sum(1 for _, c in rows if c)
    by_day: dict[date, list[int]] = defaultdict(lambda: [0, 0])  # [count, correct]
    for answered_at, correct in rows:
        d = aware(answered_at).date()
        by_day[d][0] += 1
        if correct:
            by_day[d][1] += 1

    active_days = set(by_day.keys())

    # Dense series for the last WINDOW_DAYS (oldest first), zero-filled.
    reviews_by_day = []
    for offset in range(WINDOW_DAYS - 1, -1, -1):
        d = today - timedelta(days=offset)
        count, ok = by_day.get(d, [0, 0])
        reviews_by_day.append({"date": d.isoformat(), "count": count, "correct": ok})

    # SRS distribution.
    dist = {"apprentice": 0, "guru": 0, "master": 0, "enlightened": 0, "burned": 0}
    for stage, n in db.execute(
        select(UserItemState.srs_stage, func.count())
        .where(UserItemState.user_id == user.id)
        .group_by(UserItemState.srs_stage)
    ).all():
        dist[engine.band(stage)] += n

    items_started = db.scalar(
        select(func.count()).select_from(UserItemState).where(UserItemState.user_id == user.id)
    ) or 0
    items_burned = dist["burned"]

    return {
        "totals": {
            "total_reviews": total,
            "accuracy": round(correct_total / total, 3) if total else None,
            "current_streak": _current_streak(active_days, today),
            "longest_streak": _longest_streak(active_days),
            "items_started": items_started,
            "items_burned": items_burned,
        },
        "reviews_by_day": reviews_by_day,
        "srs_distribution": dist,
    }
