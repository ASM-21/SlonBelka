"""Tests for sync, settings, and vacation mode."""

from __future__ import annotations

from tests.conftest import make_all_due


def _by_lemma(client, headers) -> dict:
    return {
        it["stressed_form"].replace("\u0301", ""): it
        for it in client.get("/lessons", headers=headers).json()
    }


def _start_all_due(client, headers):
    by = _by_lemma(client, headers)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by.values()]}, headers=headers)
    make_all_due()
    return by


# --------------------------------------------------------------------------- #
# Sync
# --------------------------------------------------------------------------- #
def test_sync_replays_and_advances(client, auth):
    by = _start_all_due(client, auth)
    voda = by["вода"]["id"]
    payload = {"events": [
        {"item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "s1"},
        {"item_id": voda, "question_type": "production", "answer": "вода", "client_event_id": "s2"},
    ]}
    r = client.post("/reviews/sync", json=payload, headers=auth)
    assert r.status_code == 200
    results = r.json()["results"]
    assert {x["client_event_id"] for x in results} == {"s1", "s2"}
    # The pass completed and the item advanced.
    final = [x for x in results if x["client_event_id"] == "s2"][0]
    assert final["srs_stage"] == 2
    remaining = {(rv["item_id"], rv["question_type"]) for rv in client.get("/reviews", headers=auth).json()}
    assert (voda, "production") not in remaining


def test_sync_is_idempotent(client, auth):
    by = _start_all_due(client, auth)
    voda = by["вода"]["id"]
    payload = {"events": [
        {"item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "s1"},
        {"item_id": voda, "question_type": "production", "answer": "вода", "client_event_id": "s2"},
    ]}
    client.post("/reviews/sync", json=payload, headers=auth)
    # Re-sync the same events; nothing should double-apply.
    again = client.post("/reviews/sync", json=payload, headers=auth).json()["results"]
    assert all(x["status"] == "duplicate" for x in again)
    prod = [x for x in again if x["client_event_id"] == "s2"][0]
    assert prod["srs_stage"] == 2  # stayed at Apprentice 2, not advanced again


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #
def test_settings_defaults_and_patch(client, auth):
    s = client.get("/settings", headers=auth).json()
    assert s["daily_lesson_cap"] == 15
    assert s["keyboard_layout"] == "jcuken"
    assert s["frozen"] is False

    r = client.patch("/settings", json={"daily_lesson_cap": 5}, headers=auth)
    assert r.json()["daily_lesson_cap"] == 5
    # The lesson cap is now enforced.
    assert len(client.get("/lessons", headers=auth).json()) == 5


# --------------------------------------------------------------------------- #
# Vacation
# --------------------------------------------------------------------------- #
def test_vacation_freezes_and_unfreezes(client, auth):
    _start_all_due(client, auth)
    assert len(client.get("/reviews", headers=auth).json()) > 0

    # Freeze: no reviews surface, dashboard reports frozen.
    assert client.post("/settings/vacation", json={"on": True}, headers=auth).json()["frozen"] is True
    assert client.get("/reviews", headers=auth).json() == []
    d = client.get("/dashboard", headers=auth).json()
    assert d["frozen"] is True
    assert d["reviews_due"] == 0
    assert client.get("/settings", headers=auth).json()["frozen"] is True

    # Unfreeze: reviews come back.
    assert client.post("/settings/vacation", json={"on": False}, headers=auth).json()["frozen"] is False
    assert len(client.get("/reviews", headers=auth).json()) > 0
