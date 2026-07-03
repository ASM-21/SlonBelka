"""Tests for entitlements, the paywall, and billing webhook handling."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from tests.conftest import make_all_due


@pytest.fixture()
def free_limit_1(monkeypatch):
    """Cap the free tier at level 1 so the seed's level 2 is behind the paywall."""
    from app.config import settings
    monkeypatch.setattr(settings, "free_level_limit", 1)
    return settings


def _uid(client, headers) -> int:
    return client.get("/auth/me", headers=headers).json()["id"]


def _guru_all_level1(uid: int) -> None:
    from app.db import SessionLocal
    from app.models import Item, UserItemState
    with SessionLocal() as db:
        for it in db.scalars(select(Item).where(Item.level == 1)).all():
            db.add(UserItemState(user_id=uid, item_id=it.id, srs_stage=5, available_at=None))
        db.commit()


def _make_premium(uid: int) -> None:
    """Simulate a completed checkout via the webhook handler."""
    from app.db import SessionLocal
    from app.services import billing
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "metadata": {"user_id": str(uid), "plan": "monthly"},
            "customer": "cus_test123",
            "subscription": "sub_test123",
        }},
    }
    with SessionLocal() as db:
        billing.apply_stripe_event(db, event)


def test_free_user_walled_at_limit(client, auth, free_limit_1):
    uid = _uid(client, auth)
    # Level 1 lessons are available; level 2 is not (free limit is 1).
    levels = {it["level"] for it in client.get("/lessons", headers=auth).json()}
    assert levels == {1}

    # Guru all of level 1, then a completed pass must NOT advance past the wall.
    _guru_all_level1(uid)
    from app.db import SessionLocal
    from app.models import User
    from app.services import learning
    with SessionLocal() as db:
        user = db.get(User, uid)
        assert learning.maybe_level_up(db, user) is False
        assert user.current_level == 1


def test_premium_unlocks_next_level(client, auth, free_limit_1):
    uid = _uid(client, auth)
    _guru_all_level1(uid)
    _make_premium(uid)

    # Now level-up is allowed and level-2 lessons appear.
    from app.db import SessionLocal
    from app.models import User
    from app.services import learning
    with SessionLocal() as db:
        user = db.get(User, uid)
        assert learning.maybe_level_up(db, user) is True
        assert user.current_level == 2
        db.commit()

    levels = {it["level"] for it in client.get("/lessons", headers=auth).json()}
    assert 2 in levels


def test_billing_status_reflects_premium(client, auth, free_limit_1):
    uid = _uid(client, auth)
    before = client.get("/billing/status", headers=auth).json()
    assert before["is_premium"] is False
    assert before["status"] == "none"
    assert before["free_level_limit"] == 1

    _make_premium(uid)
    after = client.get("/billing/status", headers=auth).json()
    assert after["is_premium"] is True
    assert after["status"] == "active"
    assert after["plan"] == "monthly"


def test_subscription_canceled_revokes_premium(client, auth):
    uid = _uid(client, auth)
    _make_premium(uid)
    assert client.get("/billing/status", headers=auth).json()["is_premium"] is True

    from app.db import SessionLocal
    from app.services import billing
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_test123"}},
    }
    with SessionLocal() as db:
        billing.apply_stripe_event(db, event)
    assert client.get("/billing/status", headers=auth).json()["is_premium"] is False


def test_payment_failed_marks_past_due(client, auth):
    uid = _uid(client, auth)
    _make_premium(uid)
    from app.db import SessionLocal
    from app.services import billing
    with SessionLocal() as db:
        billing.apply_stripe_event(db, {
            "type": "invoice.payment_failed",
            "data": {"object": {"customer": "cus_test123"}},
        })
    status = client.get("/billing/status", headers=auth).json()
    assert status["status"] == "past_due"
    assert status["is_premium"] is False  # past_due is not premium in v1


def test_checkout_returns_503_without_stripe(client, auth):
    r = client.post("/billing/checkout", json={"plan": "monthly"}, headers=auth)
    assert r.status_code == 503


def test_webhook_accepts_unsigned_json_in_dev(client):
    # In dev/test, the webhook accepts unsigned JSON.
    r = client.post("/billing/webhook", json={"type": "ping", "data": {"object": {}}})
    assert r.status_code == 200
    assert r.json()["received"] is True
