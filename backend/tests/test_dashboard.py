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
