"""
Rate limiter, keyed by endpoint name plus client IP.

Two backends behind one interface. Without REDIS_URL the limiter is the
original in-memory sliding window: process-local, zero setup, what dev and
tests use. With REDIS_URL set (production) it becomes a Redis fixed window
so limits hold across every worker process. The fixed window allows up to a
2x burst at a window boundary, which is acceptable for auth throttling.

Redis errors fail open: an outage degrades to no throttling rather than
locking every user out of login. The warning log makes the outage visible.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque

import redis
from fastapi import HTTPException, Request, status

from app.config import settings

logger = logging.getLogger(__name__)

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()

_redis_client: redis.Redis | None = None

# Count the hit and start the window on the first one, in one atomic call.
_WINDOW_LUA = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
"""


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(settings.redis_url)
    return _redis_client


def _allow_redis(key: str, limit: int, window_seconds: float) -> bool:
    try:
        count = _get_redis().eval(_WINDOW_LUA, 1, f"rl:{key}", int(window_seconds * 1000))
        return int(count) <= limit
    except redis.RedisError:
        logger.warning("Rate limiter Redis call failed, allowing request", exc_info=True)
        return True


def _allow_memory(key: str, limit: int, window_seconds: float) -> bool:
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


def _allow(key: str, limit: int, window_seconds: float) -> bool:
    if settings.redis_url:
        return _allow_redis(key, limit, window_seconds)
    return _allow_memory(key, limit, window_seconds)


def reset() -> None:
    """Clear all counters (used between tests)."""
    with _lock:
        _hits.clear()
    if settings.redis_url and _redis_client is not None:
        try:
            for key in _redis_client.scan_iter("rl:*"):
                _redis_client.delete(key)
        except redis.RedisError:
            logger.warning("Rate limiter reset could not reach Redis", exc_info=True)


def rate_limit(name: str, limit: int, window_seconds: float):
    """Dependency factory: allow `limit` requests per `window_seconds` per IP."""

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "anon"
        if not _allow(f"{name}:{client}", limit, window_seconds):
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, slow down"
            )

    return dependency
