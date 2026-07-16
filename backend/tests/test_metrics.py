"""Readiness probe and in-process request metrics."""

from __future__ import annotations

import pytest

from app.services.metrics import registry


@pytest.fixture(autouse=True)
def _fresh_metrics():
    registry.reset()
    yield
    registry.reset()


def test_ready_ok_when_database_answers(client):
    r = client.get("/health/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ready", "database": "ok"}


def test_ready_503_when_database_is_down(client, monkeypatch):
    from app import main

    class BrokenSession:
        def __enter__(self):
            raise RuntimeError("db down")

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(main, "SessionLocal", lambda: BrokenSession())
    r = client.get("/health/ready")
    assert r.status_code == 503
    assert r.json()["status"] == "unavailable"


def test_requests_are_counted_with_status_class_and_latency(client):
    client.get("/dashboard")  # 401, no auth
    client.get("/dashboard")
    snap = registry.snapshot()
    assert snap["requests_total"] == 2
    assert snap["requests_by_class"] == {"4xx": 2}
    assert sum(snap["latency_buckets"].values()) == 2
    assert snap["latency_ms_avg"] is not None


def test_probe_paths_are_not_counted(client):
    client.get("/health")
    client.get("/health/ready")
    assert registry.snapshot()["requests_total"] == 0


def test_metrics_endpoint_requires_token(client, monkeypatch):
    from app.config import settings

    # Unconfigured: the endpoint answers 503 like the other internal tasks.
    assert settings.internal_task_token is None
    assert client.get("/internal/metrics").status_code == 503

    monkeypatch.setattr(settings, "internal_task_token", "s3cret")
    assert client.get("/internal/metrics").status_code == 403
    bad = client.get("/internal/metrics", headers={"X-Internal-Token": "wrong"})
    assert bad.status_code == 403

    ok = client.get("/internal/metrics", headers={"X-Internal-Token": "s3cret"})
    assert ok.status_code == 200
    body = ok.json()
    assert body["requests_total"] >= 2  # the two rejected calls above
    assert "latency_buckets" in body and "uptime_seconds" in body
