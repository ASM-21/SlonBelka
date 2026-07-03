"""Tests for push subscription storage."""

from __future__ import annotations

from sqlalchemy import select


def _sub_body(endpoint="https://push.example/abc"):
    return {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}}


def test_subscribe_stores_subscription(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    r = client.post("/push/subscribe", json=_sub_body(), headers=auth)
    assert r.status_code == 200 and r.json()["subscribed"] is True

    from app.db import SessionLocal
    from app.models import PushSubscription
    with SessionLocal() as db:
        subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == uid)).all()
    assert len(subs) == 1 and subs[0].keys["auth"] == "a"


def test_subscribe_is_idempotent_per_endpoint(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    client.post("/push/subscribe", json=_sub_body(), headers=auth)
    # Same endpoint, updated keys -> still one row, keys updated.
    client.post("/push/subscribe", json={"endpoint": "https://push.example/abc", "keys": {"p256dh": "k2", "auth": "a2"}}, headers=auth)
    from app.db import SessionLocal
    from app.models import PushSubscription
    with SessionLocal() as db:
        subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == uid)).all()
    assert len(subs) == 1 and subs[0].keys["auth"] == "a2"


def test_unsubscribe_removes_subscription(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    client.post("/push/subscribe", json=_sub_body(), headers=auth)
    r = client.delete("/push/subscribe?endpoint=https://push.example/abc", headers=auth)
    assert r.status_code == 204
    from app.db import SessionLocal
    from app.models import PushSubscription
    with SessionLocal() as db:
        assert db.scalars(select(PushSubscription).where(PushSubscription.user_id == uid)).all() == []


def test_subscribe_requires_auth(client):
    assert client.post("/push/subscribe", json=_sub_body()).status_code in (401, 403)
