"""In-process request metrics.

A single registry fed by RequestLogMiddleware and read by
GET /internal/metrics. Counters only, no external dependency: enough to see
traffic volume, error rate, and latency shape on a single-process deploy.
Multi-worker deploys report per-worker numbers, which is acceptable at this
scale; a shared store can replace this if the deployment grows.
"""

from __future__ import annotations

import threading

from app.timeutil import utcnow

# Upper bounds in milliseconds for the latency histogram. The last bucket
# catches everything slower.
LATENCY_BUCKETS_MS = (25, 50, 100, 250, 500, 1000, 2500)


class _Registry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self._started_at = utcnow()
            self._total = 0
            self._by_class: dict[str, int] = {}
            self._latency = [0] * (len(LATENCY_BUCKETS_MS) + 1)
            self._latency_sum_ms = 0.0

    def record(self, status: int | None, duration_ms: float) -> None:
        klass = f"{status // 100}xx" if isinstance(status, int) else "unfinished"
        with self._lock:
            self._total += 1
            self._by_class[klass] = self._by_class.get(klass, 0) + 1
            self._latency_sum_ms += duration_ms
            for i, bound in enumerate(LATENCY_BUCKETS_MS):
                if duration_ms <= bound:
                    self._latency[i] += 1
                    break
            else:
                self._latency[-1] += 1

    def snapshot(self) -> dict:
        with self._lock:
            buckets = {f"le_{b}ms": n for b, n in zip(LATENCY_BUCKETS_MS, self._latency)}
            buckets[f"gt_{LATENCY_BUCKETS_MS[-1]}ms"] = self._latency[-1]
            return {
                "started_at": self._started_at.isoformat(),
                "uptime_seconds": (utcnow() - self._started_at).total_seconds(),
                "requests_total": self._total,
                "requests_by_class": dict(self._by_class),
                "latency_ms_avg": (self._latency_sum_ms / self._total) if self._total else None,
                "latency_buckets": buckets,
            }


registry = _Registry()
