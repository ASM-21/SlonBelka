"""Tests for the dashboard endpoint."""

from __future__ import annotations

from tests.conftest import make_all_due


def test_dashboard_initial_state(client, auth):
    d = client.get("/dashboard", headers=auth).json()
    assert d["current_level"] == 1
    assert d["lessons_available"] == 8           # all level-1 seed words, none started
    assert d["reviews_due"] == 0
    assert d["total_reviews"] == 0
    assert d["accuracy"] is None
    assert d["streak"] == 0
    assert d["srs_counts"]["apprentice"] == 0
    assert d["level_progress"]["total"] == 8
    assert d["level_progress"]["threshold"] == 0.70


def test_dashboard_after_lessons(client, auth):
    ids = [it["id"] for it in client.get("/lessons", headers=auth).json()][:3]
    client.post("/lessons/complete", json={"item_ids": ids}, headers=auth)
    d = client.get("/dashboard", headers=auth).json()
    assert d["srs_counts"]["apprentice"] == 3
    assert d["lessons_available"] == 5            # 8 total minus 3 started
    make_all_due()
    d2 = client.get("/dashboard", headers=auth).json()
    assert d2["reviews_due"] == 3


def _guru_n_level1_items(client, headers, n: int) -> None:
    """Directly set n level-1 items to Guru for the authed user."""
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Item, UserItemState

    uid = client.get("/auth/me", headers=headers).json()["id"]
    with SessionLocal() as db:
        items = db.scalars(select(Item).where(Item.level == 1).order_by(Item.id)).all()
        for it in items[:n]:
            db.add(UserItemState(user_id=uid, item_id=it.id, srs_stage=5, available_at=None))
        db.commit()


def test_dashboard_advances_cleared_level_when_entitled(client, auth):
    # 6/8 level-1 items at Guru clears the 70% threshold; the free tier allows
    # level 2, so loading the dashboard performs the pending level-up.
    _guru_n_level1_items(client, auth, 6)
    d = client.get("/dashboard", headers=auth).json()
    assert d["current_level"] == 2
    assert d["level_progress"]["level"] == 2
    assert d["level_progress"]["cleared"] is False


def test_dashboard_cleared_flag_marks_free_tier_wall(client, auth, monkeypatch):
    # With the free limit at the current level, clearing it cannot advance:
    # the response keeps the level and reports cleared=True (the paywall case
    # the home screen upsell keys on).
    from app.config import settings

    monkeypatch.setattr(settings, "free_level_limit", 1)
    _guru_n_level1_items(client, auth, 6)
    d = client.get("/dashboard", headers=auth).json()
    assert d["current_level"] == 1
    assert d["level_progress"]["cleared"] is True


def test_dashboard_accuracy_after_review(client, auth):
    by_lemma = {
        it["stressed_form"].replace("\u0301", ""): it
        for it in client.get("/lessons", headers=auth).json()
    }
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    make_all_due()
    voda = by_lemma["вода"]["id"]
    client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "a1"})
    client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "production", "answer": "вода", "client_event_id": "a2"})
    d = client.get("/dashboard", headers=auth).json()
    assert d["total_reviews"] == 2
    assert d["accuracy"] == 1.0
    assert d["streak"] == 1
