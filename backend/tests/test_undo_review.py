"""Undo / typo correction on the last review answer."""

from __future__ import annotations

from app.db import SessionLocal
from app.models import ReviewEvent, UserItemState
from tests.conftest import make_all_due


def _learn_one(client, auth):
    lessons = client.get("/lessons", headers=auth).json()
    item = lessons[0]
    client.post("/lessons/complete", headers=auth, json={"item_ids": [item["id"]]})
    make_all_due()
    return item


def _answer(client, auth, item, qtype, answer, ceid):
    return client.post("/reviews", headers=auth, json={
        "item_id": item["id"],
        "question_type": qtype,
        "answer": answer,
        "client_event_id": ceid,
    }).json()


def test_undo_flips_wrong_meaning_to_correct(client, auth):
    item = _learn_one(client, auth)
    res = _answer(client, auth, item, "meaning", "definitely-wrong-xyz", "e1")
    assert res["correct"] is False

    r = client.post("/reviews/undo", headers=auth, json={"client_event_id": "e1"})
    assert r.status_code == 200
    body = r.json()
    assert body["correct"] is True
    assert body["status"] == "corrected"

    with SessionLocal() as db:
        ev = db.query(ReviewEvent).filter_by(client_event_id="e1").one()
        assert ev.correct is True
        assert ev.was_override is True


def test_undo_completes_pass_and_advances_stage(client, auth):
    item = _learn_one(client, auth)
    # Get the meaning right, the production wrong, then undo the production.
    _answer(client, auth, item, "meaning", item["translation_primary"], "m1")
    prod = _answer(client, auth, item, "production", "неправильно-xyz", "p1")
    assert prod["correct"] is False
    assert prod["pass_complete"] is False

    with SessionLocal() as db:
        before = db.query(UserItemState).filter_by(item_id=item["id"]).one().srs_stage

    r = client.post("/reviews/undo", headers=auth, json={"client_event_id": "p1"}).json()
    assert r["correct"] is True
    assert r["pass_complete"] is True

    with SessionLocal() as db:
        st = db.query(UserItemState).filter_by(item_id=item["id"]).one()
        assert st.srs_stage > before  # a clean pass advanced the stage
        assert st.incorrect_count == 0  # the miss was corrected, no penalty


def test_undo_is_idempotent_on_already_correct(client, auth):
    item = _learn_one(client, auth)
    _answer(client, auth, item, "meaning", item["translation_primary"], "m1")
    r = client.post("/reviews/undo", headers=auth, json={"client_event_id": "m1"})
    assert r.status_code == 200
    assert r.json()["correct"] is True


def test_undo_unknown_event_is_404(client, auth):
    r = client.post("/reviews/undo", headers=auth, json={"client_event_id": "does-not-exist"})
    assert r.status_code == 404


def test_undo_superseded_by_newer_answer_is_409(client, auth):
    item = _learn_one(client, auth)
    # Two wrong meaning answers; the first can no longer be corrected.
    _answer(client, auth, item, "meaning", "wrong-one", "e1")
    _answer(client, auth, item, "meaning", "wrong-two", "e2")
    r = client.post("/reviews/undo", headers=auth, json={"client_event_id": "e1"})
    assert r.status_code == 409
