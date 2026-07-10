"""Push delivery and the review-reminder sweep (D3)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from pywebpush import WebPushException

from app.db import SessionLocal
from app.models import PushSubscription, User
from app.services import push as push_service
from app.timeutil import utcnow
from tests.conftest import make_all_due


@pytest.fixture()
def vapid(monkeypatch):
    monkeypatch.setattr(push_service.settings, "vapid_public_key", "pub")
    monkeypatch.setattr(push_service.settings, "vapid_private_key", "priv")


def _setup_due_user(client, email="p@e.com"):
    """Register, learn one word, make it due, subscribe to push."""
    r = client.post("/auth/register", json={
        "email": email, "password": "password123", "accepted_terms": True,
    })
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    lessons = client.get("/lessons", headers=headers).json()
    client.post("/lessons/complete", headers=headers, json={"item_ids": [lessons[0]["id"]]})
    make_all_due()
    client.post("/push/subscribe", headers=headers, json={
        "endpoint": f"https://push.example/{email}", "keys": {"p256dh": "a", "auth": "b"},
    })
    return headers


def test_reminder_sent_once_then_cooldown(client, vapid, monkeypatch):
    _setup_due_user(client)
    calls = []
    monkeypatch.setattr(push_service, "webpush", lambda **kw: calls.append(kw))

    with SessionLocal() as db:
        first = push_service.send_review_reminders(db)
    assert first["sent"] == 1
    assert len(calls) == 1
    assert "1 review due" in calls[0]["data"]

    # A second run inside the cooldown sends nothing.
    with SessionLocal() as db:
        second = push_service.send_review_reminders(db)
    assert second["sent"] == 0
    assert second["skipped"] == 1
    assert len(calls) == 1


def test_reminder_sends_again_after_cooldown(client, vapid, monkeypatch):
    _setup_due_user(client)
    calls = []
    monkeypatch.setattr(push_service, "webpush", lambda **kw: calls.append(kw))

    with SessionLocal() as db:
        push_service.send_review_reminders(db)
        # Age the cooldown stamp past the window.
        user = db.query(User).filter(User.email == "p@e.com").one()
        stale = (utcnow() - push_service.REMINDER_COOLDOWN - timedelta(minutes=1)).isoformat()
        user.settings = {**(user.settings or {}), push_service.REMINDER_KEY: stale}
        db.commit()
        result = push_service.send_review_reminders(db)
    assert result["sent"] == 1
    assert len(calls) == 2


def test_frozen_user_is_skipped(client, vapid, monkeypatch):
    headers = _setup_due_user(client)
    client.post("/settings/vacation", headers=headers, json={"on": True})
    calls = []
    monkeypatch.setattr(push_service, "webpush", lambda **kw: calls.append(kw))

    with SessionLocal() as db:
        result = push_service.send_review_reminders(db)
    assert result["sent"] == 0
    assert result["skipped"] == 1
    assert calls == []


def test_gone_subscription_is_pruned(client, vapid, monkeypatch):
    _setup_due_user(client)

    class GoneResponse:
        status_code = 410

    def gone(**kwargs):
        raise WebPushException("gone", response=GoneResponse())

    monkeypatch.setattr(push_service, "webpush", gone)
    with SessionLocal() as db:
        result = push_service.send_review_reminders(db)
        assert result["sent"] == 0
        assert db.query(PushSubscription).count() == 0


def test_unconfigured_sweep_is_a_noop(client):
    _setup_due_user(client)
    with SessionLocal() as db:
        result = push_service.send_review_reminders(db)
    assert result == {"sent": 0, "skipped": 0, "checked": 0, "configured": False}


def test_internal_endpoint_auth(client, vapid, monkeypatch):
    # Unconfigured token: 503.
    r = client.post("/internal/push/run")
    assert r.status_code == 503

    monkeypatch.setattr(push_service.settings, "internal_task_token", "cron-secret")
    assert client.post("/internal/push/run").status_code == 403
    assert client.post(
        "/internal/push/run", headers={"X-Internal-Token": "wrong"}
    ).status_code == 403

    monkeypatch.setattr(push_service, "webpush", lambda **kw: None)
    r = client.post("/internal/push/run", headers={"X-Internal-Token": "cron-secret"})
    assert r.status_code == 200
    assert r.json()["configured"] is True
