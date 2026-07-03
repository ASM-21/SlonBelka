"""Tests for the progress stats endpoint."""

from __future__ import annotations

import uuid

from sqlalchemy import select


def _start_and_due(client, auth, uid):
    from datetime import datetime, timedelta, timezone
    from app.db import SessionLocal
    from app.models import Item, UserItemState
    with SessionLocal() as db:
        item = db.scalars(select(Item).where(Item.level == 1)).first()
        item_id = item.id
    client.post("/lessons/complete", json={"item_ids": [item_id]}, headers=auth)
    with SessionLocal() as db:
        st = db.scalar(
            select(UserItemState).where(
                (UserItemState.user_id == uid) & (UserItemState.item_id == item_id)
            )
        )
        st.available_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
    return item_id


def test_stats_shape(client, auth):
    body = client.get("/stats", headers=auth).json()
    assert set(body) == {"totals", "reviews_by_day", "srs_distribution"}
    assert len(body["reviews_by_day"]) == 30
    assert set(body["srs_distribution"]) == {"apprentice", "guru", "master", "enlightened", "burned"}
    assert body["totals"]["total_reviews"] == 0
    assert body["totals"]["accuracy"] is None


def test_stats_counts_reviews(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item_id = _start_and_due(client, auth, uid)
    # Get the prompt's expected answer by reading the item.
    from app.db import SessionLocal
    from app.models import Item
    with SessionLocal() as db:
        item = db.get(Item, item_id)
        translation, lemma = item.translation_primary, item.lemma

    # One correct meaning answer.
    client.post(
        "/reviews",
        json={"item_id": item_id, "question_type": "meaning", "answer": translation,
              "client_event_id": str(uuid.uuid4())},
        headers=auth,
    )

    stats = client.get("/stats", headers=auth).json()
    assert stats["totals"]["total_reviews"] >= 1
    assert stats["totals"]["accuracy"] is not None
    assert stats["totals"]["current_streak"] >= 1
    # Today's bucket (last entry) reflects the review.
    assert stats["reviews_by_day"][-1]["count"] >= 1


def test_stats_distribution_reflects_state(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    from app.db import SessionLocal
    from app.models import Item, UserItemState
    with SessionLocal() as db:
        item = db.scalars(select(Item).where(Item.level == 1)).first()
        db.add(UserItemState(user_id=uid, item_id=item.id, srs_stage=5))  # guru
        db.commit()
    dist = client.get("/stats", headers=auth).json()["srs_distribution"]
    assert dist["guru"] >= 1
