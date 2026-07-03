"""Tests for the leech section, practice, extra study, and mnemonics."""

from __future__ import annotations

from sqlalchemy import select

from tests.conftest import make_all_due


def _uid(client, headers) -> int:
    return client.get("/auth/me", headers=headers).json()["id"]


def _make_leech(uid: int) -> int:
    """Create a level-1 item state flagged as a leech. Returns the item id."""
    from app.db import SessionLocal
    from app.models import Item, UserItemState

    with SessionLocal() as db:
        item = db.scalars(select(Item).where(Item.level == 1).order_by(Item.id)).first()
        db.add(UserItemState(
            user_id=uid, item_id=item.id, srs_stage=2,
            correct_count=2, incorrect_count=5, correct_streak=0,
            leech_score=2.5, is_leech=True,
        ))
        db.commit()
        return item.id


def test_leeches_listed_with_stats(client, auth):
    uid = _uid(client, auth)
    item_id = _make_leech(uid)
    leeches = client.get("/leeches", headers=auth).json()
    assert len(leeches) == 1
    lt = leeches[0]
    assert lt["item_id"] == item_id
    assert lt["incorrect_count"] == 5
    assert lt["accuracy"] == round(2 / 7, 3)
    assert lt["leech_score"] == 2.5


def test_no_leeches_when_none(client, auth):
    assert client.get("/leeches", headers=auth).json() == []


def test_leech_study_set_has_both_question_types(client, auth):
    uid = _uid(client, auth)
    _make_leech(uid)
    s = client.post("/leeches/study", headers=auth).json()
    assert len(s) == 2
    assert {r["question_type"] for r in s} == {"meaning", "production"}


def test_practice_grades_without_touching_srs(client, auth):
    """Practice must not record events or change the schedule."""
    by_lemma = {
        it["stressed_form"].replace("\u0301", ""): it
        for it in client.get("/lessons", headers=auth).json()
    }
    ids = [it["id"] for it in by_lemma.values()]
    client.post("/lessons/complete", json={"item_ids": ids}, headers=auth)
    make_all_due()
    voda = by_lemma["вода"]["id"]

    before = client.get("/dashboard", headers=auth).json()
    r = client.post("/practice", headers=auth, json={
        "item_id": voda, "question_type": "production", "answer": "вода"})
    assert r.json()["correct"] is True
    after = client.get("/dashboard", headers=auth).json()

    # Nothing recorded, nothing rescheduled.
    assert after["total_reviews"] == before["total_reviews"] == 0
    assert after["srs_counts"] == before["srs_counts"]
    # Item is still due (practice did not advance it).
    due = {(rv["item_id"], rv["question_type"]) for rv in client.get("/reviews", headers=auth).json()}
    assert (voda, "production") in due


def test_practice_incorrect(client, auth):
    voda = next(
        it for it in client.get("/lessons", headers=auth).json()
        if it["stressed_form"].replace("\u0301", "") == "вода"
    )["id"]
    r = client.post("/practice", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "fire"})
    assert r.json()["correct"] is False


def test_extra_study_recently_learned(client, auth):
    ids = [it["id"] for it in client.get("/lessons", headers=auth).json()][:3]
    client.post("/lessons/complete", json={"item_ids": ids}, headers=auth)
    s = client.get("/extra-study", params={"mode": "recently_learned"}, headers=auth).json()
    # 3 items x 2 question types.
    assert len(s) == 6


def test_mnemonic_upsert(client, auth):
    item_id = client.get("/lessons", headers=auth).json()[0]["id"]
    r = client.put(f"/items/{item_id}/mnemonic", headers=auth, json={
        "meaning_mnemonic": "picture a house"})
    assert r.status_code == 200
    assert r.json()["meaning_mnemonic"] == "picture a house"
    # Update the other field; the first should persist.
    r2 = client.put(f"/items/{item_id}/mnemonic", headers=auth, json={
        "reading_mnemonic": "sounds like dom"})
    body = r2.json()
    assert body["meaning_mnemonic"] == "picture a house"
    assert body["reading_mnemonic"] == "sounds like dom"
