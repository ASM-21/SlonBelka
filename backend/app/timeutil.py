"""Shared time helpers.

Centralizes the UTC-now and naive-to-aware coercion that several services need
(sqlite hands back naive datetimes, so comparisons must be normalized).
"""

from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Timezone-aware current time in UTC."""
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    """Coerce a possibly-naive datetime to aware UTC; pass through None."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
