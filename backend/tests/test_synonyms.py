"""Tests for user synonyms and their effect on review grading."""

from __future__ import annotations

import uuid

from sqlalchemy import select


def _start_level1(client, auth):
    """Start a level-1 item and return its id and translation."""
    from app.db import SessionLocal
    from app.models import Item
    with SessionLocal() as db:
        it = db.scalars(select(Item).where(Item.level == 1)).first()
        data = {"id": it.id, "translation": it.translation_primary, "lemma": it.lemma}
    client.post("/lessons/complete", json={"item_ids": [data["id"]]}, headers=auth)
    return data


def _make_due(uid: int, item_id: int):
    from datetime import datetime, timedelta, timezone
    from app.db import SessionLocal
    from app.models import UserItemState
    with SessionLocal() as db:
        st = db.scalar(
            select(UserItemState).where(
                (UserItemState.user_id == uid) & (UserItemState.item_id == item_id)
            )
        )
        st.available_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()


def test_add_synonym_returns_list(client, auth):
    item = _start_level1(client, auth)
    r = client.post(f"/items/{item['id']}/synonyms", json={"text": "townlet"}, headers=auth)
    assert r.status_code == 200
    assert "townlet" in r.json()["synonyms"]


def test_synonym_is_accepted_in_review(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item = _start_level1(client, auth)
    # A made-up synonym that is NOT the real translation.
    client.post(f"/items/{item['id']}/synonyms", json={"text": "zzwidget"}, headers=auth)
    _make_due(uid, item["id"])

    r = client.post(
        "/reviews",
        json={
            "item_id": item["id"],
            "question_type": "meaning",
            "answer": "zzwidget",
            "client_event_id": str(uuid.uuid4()),
        },
        headers=auth,
    )
    assert r.status_code == 200
    assert r.json()["correct"] is True


def test_meaning_without_synonym_still_wrong(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item = _start_level1(client, auth)
    _make_due(uid, item["id"])
    r = client.post(
        "/reviews",
        json={
            "item_id": item["id"],
            "question_type": "meaning",
            "answer": "zzwidget",  # not added as a synonym
            "client_event_id": str(uuid.uuid4()),
        },
        headers=auth,
    )
    assert r.json()["correct"] is False


def test_synonyms_dedupe_case_insensitive(client, auth):
    item = _start_level1(client, auth)
    client.post(f"/items/{item['id']}/synonyms", json={"text": "Town"}, headers=auth)
    r = client.post(f"/items/{item['id']}/synonyms", json={"text": "town"}, headers=auth)
    assert r.json()["synonyms"].count("Town") + r.json()["synonyms"].count("town") == 1


def test_remove_synonym(client, auth):
    item = _start_level1(client, auth)
    client.post(f"/items/{item['id']}/synonyms", json={"text": "hamlet"}, headers=auth)
    r = client.delete(f"/items/{item['id']}/synonyms?text=hamlet", headers=auth)
    assert "hamlet" not in r.json()["synonyms"]


def test_detail_includes_synonyms(client, auth):
    item = _start_level1(client, auth)
    client.post(f"/items/{item['id']}/synonyms", json={"text": "burg"}, headers=auth)
    detail = client.get(f"/items/{item['id']}", headers=auth).json()
    assert "burg" in detail["synonyms"]


def test_synonym_cap(client, auth):
    item = _start_level1(client, auth)
    last = None
    for i in range(25):
        last = client.post(f"/items/{item['id']}/synonyms", json={"text": f"syn{i}"}, headers=auth).json()
    assert len(last["synonyms"]) == 20  # capped
