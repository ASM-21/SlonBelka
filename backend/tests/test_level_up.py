"""Tests for automatic level progression."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from tests.conftest import make_all_due


def _uid(client, headers) -> int:
    return client.get("/auth/me", headers=headers).json()["id"]


def _guru_n_level1_items(uid: int, n: int) -> list[int]:
    """Directly set n level-1 items to Guru for the user. Returns their ids."""
    from app.db import SessionLocal
    from app.models import Item, UserItemState

    with SessionLocal() as db:
        items = db.scalars(select(Item).where(Item.level == 1).order_by(Item.id)).all()
        chosen = items[:n]
        for it in chosen:
            db.add(UserItemState(user_id=uid, item_id=it.id, srs_stage=5, available_at=None))
        db.commit()
        return [it.id for it in chosen]


def test_maybe_level_up_unit(client, auth):
    uid = _uid(client, auth)
    # Level 1 has 8 seed items; 70% threshold -> need 6 at Guru.
    _guru_n_level1_items(uid, 6)

    from app.db import SessionLocal
    from app.models import User
    from app.services import learning

    with SessionLocal() as db:
        user = db.get(User, uid)
        assert user.current_level == 1
        leveled = learning.maybe_level_up(db, user)
        db.commit()
        assert leveled is True
        assert user.current_level == 2


def test_no_level_up_below_threshold(client, auth):
    uid = _uid(client, auth)
    _guru_n_level1_items(uid, 5)  # 5/8 = 62.5% < 70%

    from app.db import SessionLocal
    from app.models import User
    from app.services import learning

    with SessionLocal() as db:
        user = db.get(User, uid)
        leveled = learning.maybe_level_up(db, user)
        assert leveled is False
        assert user.current_level == 1


def test_level_up_reported_on_pass(client, auth):
    uid = _uid(client, auth)
    # Pre-Guru 6 level-1 items so the next completed pass tips it over.
    ids = _guru_n_level1_items(uid, 6)

    # Make one of those Guru items due so we can complete a pass on it.
    from app.db import SessionLocal
    from app.models import UserItemState

    target = ids[0]
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    with SessionLocal() as db:
        st = db.scalar(select(UserItemState).where(UserItemState.item_id == target))
        st.available_at = past
        db.commit()

    # Look up the lemma/translation for the target to answer correctly.
    from app.db import SessionLocal as SL
    from app.models import Item
    with SL() as db:
        item = db.get(Item, target)
        lemma, meaning = item.lemma, item.translation_primary

    client.post("/reviews", headers=auth, json={
        "item_id": target, "question_type": "meaning", "answer": meaning, "client_event_id": "lu1"})
    final = client.post("/reviews", headers=auth, json={
        "item_id": target, "question_type": "production", "answer": lemma, "client_event_id": "lu2"})
    body = final.json()
    assert body["pass_complete"] is True
    assert body["leveled_up"] is True
    assert body["current_level"] == 2
