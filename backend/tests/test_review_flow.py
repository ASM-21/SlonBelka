"""End-to-end lessons and reviews flow against the API."""

from __future__ import annotations

from tests.conftest import make_all_due


def _items_by_lemma(client, headers) -> dict[str, dict]:
    lessons = client.get("/lessons", headers=headers).json()
    return {it["stressed_form"].replace("\u0301", ""): it for it in lessons}


def test_lessons_only_current_level(client, auth):
    lessons = client.get("/lessons", headers=auth).json()
    # User starts at level 1; only the 8 level-1 seed words are lesson-eligible.
    assert len(lessons) == 8
    assert all(it["level"] == 1 for it in lessons)


def test_complete_lessons_then_no_reviews_until_due(client, auth):
    ids = [it["id"] for it in client.get("/lessons", headers=auth).json()]
    r = client.post("/lessons/complete", json={"item_ids": ids}, headers=auth)
    assert r.status_code == 200
    assert sorted(r.json()["started"]) == sorted(ids)
    # Nothing due yet (Apprentice 1 interval is in the future).
    assert client.get("/reviews", headers=auth).json() == []


def test_due_reviews_expand_to_two_question_types(client, auth):
    ids = [it["id"] for it in client.get("/lessons", headers=auth).json()]
    client.post("/lessons/complete", json={"item_ids": ids}, headers=auth)
    make_all_due()
    reviews = client.get("/reviews", headers=auth).json()
    assert len(reviews) == 16  # 8 items x (meaning + production)
    types = {(r["item_id"], r["question_type"]) for r in reviews}
    assert len(types) == 16


def test_full_pass_advances_stage(client, auth):
    by_lemma = _items_by_lemma(client, auth)
    ids = [it["id"] for it in by_lemma.values()]
    client.post("/lessons/complete", json={"item_ids": ids}, headers=auth)
    make_all_due()
    voda = by_lemma["вода"]["id"]

    r1 = client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "e1"})
    assert r1.status_code == 200
    assert r1.json()["correct"] is True
    assert r1.json()["pass_complete"] is False  # production still pending
    # Mid-pass answers report no stage transition.
    assert r1.json()["srs_stage_before"] == r1.json()["srs_stage"] == 1

    r2 = client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "production", "answer": "вода", "client_event_id": "e2"})
    body = r2.json()
    assert body["correct"] is True
    assert body["pass_complete"] is True
    assert body["srs_stage"] == 2
    assert body["srs_stage_before"] == 1
    assert body["srs_stage_before_name"] == "Apprentice 1"
    assert body["srs_stage_name"] == "Apprentice 2"
    assert body["available_at"] is not None
    assert body["stressed_form"] == "вода\u0301"

    # No longer due after the pass completes.
    remaining = {(r["item_id"], r["question_type"]) for r in client.get("/reviews", headers=auth).json()}
    assert (voda, "meaning") not in remaining
    assert (voda, "production") not in remaining


def test_idempotent_resubmit(client, auth):
    by_lemma = _items_by_lemma(client, auth)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    make_all_due()
    voda = by_lemma["вода"]["id"]
    client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "dup1"})
    again = client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "dup1"})
    assert again.json()["status"] == "duplicate"
    # Duplicates still carry the stage fields (no transition implied).
    assert again.json()["srs_stage_before"] == again.json()["srs_stage"]
    assert again.json()["srs_stage_name"] == "Apprentice 1"


def test_miss_keeps_stage_at_one(client, auth):
    by_lemma = _items_by_lemma(client, auth)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    make_all_due()
    dom = by_lemma["дом"]["id"]
    # Wrong meaning, then right on the re-quiz, then right production.
    client.post("/reviews", headers=auth, json={
        "item_id": dom, "question_type": "meaning", "answer": "zzz", "client_event_id": "m1"})
    client.post("/reviews", headers=auth, json={
        "item_id": dom, "question_type": "meaning", "answer": "house", "client_event_id": "m2"})
    final = client.post("/reviews", headers=auth, json={
        "item_id": dom, "question_type": "production", "answer": "дом", "client_event_id": "m3"})
    body = final.json()
    assert body["pass_complete"] is True
    assert body["srs_stage"] == 1  # a miss while at Apprentice 1 floors at 1
    assert body["srs_stage_before"] == 1
    assert body["srs_stage_name"] == "Apprentice 1"


def test_demotion_reported_on_final_correct_answer(client, auth):
    """
    A miss earlier in the pass demotes the item even when the answer that
    completes the pass is correct. The response must expose the transition so
    the client can show it instead of silently dropping the stage.
    """
    from app.db import SessionLocal
    from app.models import UserItemState

    by_lemma = _items_by_lemma(client, auth)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    voda = by_lemma["вода"]["id"]
    with SessionLocal() as db:
        st = db.query(UserItemState).filter_by(item_id=voda).first()
        st.srs_stage = 5  # Guru 1
        db.commit()
    make_all_due()

    client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "zzz", "client_event_id": "d1"})
    client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "d2"})
    final = client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "production", "answer": "вода", "client_event_id": "d3"})
    body = final.json()
    assert body["correct"] is True
    assert body["pass_complete"] is True
    # One missed type at Guru: drop round_half_up(1/2) * penalty 2 = 2 stages.
    assert body["srs_stage_before"] == 5
    assert body["srs_stage"] == 3
    assert body["srs_stage_before_name"] == "Guru 1"
    assert body["srs_stage_name"] == "Apprentice 3"


def test_override_avoids_miss(client, auth):
    by_lemma = _items_by_lemma(client, auth)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    make_all_due()
    hleb = by_lemma["хлеб"]["id"]
    client.post("/reviews", headers=auth, json={
        "item_id": hleb, "question_type": "production", "answer": "wrongish",
        "client_event_id": "o1", "override": True})
    final = client.post("/reviews", headers=auth, json={
        "item_id": hleb, "question_type": "meaning", "answer": "bread", "client_event_id": "o2"})
    body = final.json()
    assert body["pass_complete"] is True
    assert body["srs_stage"] == 2  # override means no miss, so it advances


def test_near_miss_is_not_recorded(client, auth):
    by_lemma = _items_by_lemma(client, auth)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    make_all_due()
    spasibo = by_lemma["спасибо"]["id"]
    r = client.post("/reviews", headers=auth, json={
        "item_id": spasibo, "question_type": "meaning", "answer": "thnk", "client_event_id": "n1"})
    assert r.json()["status"] == "near_miss"
    assert r.json()["pass_complete"] is False
    assert r.json()["srs_stage_before"] == r.json()["srs_stage"] == 1
    # Still pending because nothing was recorded.
    remaining = {(rv["item_id"], rv["question_type"]) for rv in client.get("/reviews", headers=auth).json()}
    assert (spasibo, "meaning") in remaining


def test_submit_not_due_item_rejected(client, auth):
    by_lemma = _items_by_lemma(client, auth)
    client.post("/lessons/complete", json={"item_ids": [it["id"] for it in by_lemma.values()]}, headers=auth)
    # Did NOT call make_all_due, so items are not due.
    voda = by_lemma["вода"]["id"]
    r = client.post("/reviews", headers=auth, json={
        "item_id": voda, "question_type": "meaning", "answer": "water", "client_event_id": "x1"})
    assert r.status_code == 409
