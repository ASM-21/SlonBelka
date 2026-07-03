"""
Simple in-memory sliding-window rate limiter.

Process-local, so for multi-instance production this should be backed by Redis.
Good enough to protect auth endpoints in a single-instance deploy and to test
the behavior. Keyed by endpoint name plus client IP.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _allow(key: str, limit: int, window_seconds: float) -> bool:
    now = time.monotonic()
    with _lock:
        dq = _hits[key]
        cutoff = now - window_seconds
        while dq and dq[0] <= cutoff:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True


def reset() -> None:
    """Clear all counters (used between tests)."""
    with _lock:
        _hits.clear()


def rate_limit(name: str, limit: int, window_seconds: float):
    """Dependency factory: allow `limit` requests per `window_seconds` per IP."""

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "anon"
        if not _allow(f"{name}:{client}", limit, window_seconds):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, slow down"
            )

    return dependency
