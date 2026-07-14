"""Rate limiter unit tests: memory window semantics and the Redis path."""

from __future__ import annotations

import time

import redis as redis_lib

from app.services import ratelimit


def test_memory_window_expires(monkeypatch):
    monkeypatch.setattr(ratelimit.settings, "redis_url", None)
    ratelimit.reset()
    assert ratelimit._allow("k", 2, 0.05)
    assert ratelimit._allow("k", 2, 0.05)
    assert not ratelimit._allow("k", 2, 0.05)
    time.sleep(0.06)
    assert ratelimit._allow("k", 2, 0.05)


class FakeRedis:
    """Records eval calls and counts up like INCR would."""

    def __init__(self):
        self.calls: list[tuple[str, int]] = []
        self.count = 0

    def eval(self, script, numkeys, key, window_ms):
        self.calls.append((key, int(window_ms)))
        self.count += 1
        return self.count


class BrokenRedis:
    def eval(self, *args, **kwargs):
        raise redis_lib.ConnectionError("redis is down")


def test_redis_path_counts_and_limits(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(ratelimit.settings, "redis_url", "redis://example")
    monkeypatch.setattr(ratelimit, "_redis_client", fake)
    assert ratelimit._allow("login:1.2.3.4", 2, 60)
    assert ratelimit._allow("login:1.2.3.4", 2, 60)
    assert not ratelimit._allow("login:1.2.3.4", 2, 60)
    # Key carries the rl: prefix and the window is passed in milliseconds.
    assert fake.calls[0] == ("rl:login:1.2.3.4", 60000)


def test_redis_failure_fails_open(monkeypatch):
    monkeypatch.setattr(ratelimit.settings, "redis_url", "redis://example")
    monkeypatch.setattr(ratelimit, "_redis_client", BrokenRedis())
    # Limit of 1, but every request is allowed because Redis is unreachable.
    assert ratelimit._allow("k", 1, 60)
    assert ratelimit._allow("k", 1, 60)


class MisconfiguredRedis:
    def eval(self, *args, **kwargs):
        # A malformed REDIS_URL surfaces as a ValueError, not a RedisError.
        raise ValueError("Redis URL must specify one of the following schemes")


def test_non_redis_error_also_fails_open(monkeypatch):
    monkeypatch.setattr(ratelimit.settings, "redis_url", "bogus://nope")
    monkeypatch.setattr(ratelimit, "_redis_client", MisconfiguredRedis())
    # Must not raise (which would 500 the guarded auth endpoint); allow instead.
    assert ratelimit._allow("k", 1, 60)
