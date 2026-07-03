"""Server-side enforcement on the lesson commit path."""

from __future__ import annotations

from sqlalchemy import select


def _level1_ids(client, auth):
    return [it["id"] for it in client.get("/lessons", headers=auth).json()]


def test_complete_respects_daily_cap(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    from app.db import SessionLocal
    from app.models import Item, User
    with SessionLocal() as db:
        u = db.get(User, uid)
        u.settings = {"daily_lesson_cap": 2}
        db.commit()
        # Read ids directly; GET /lessons would itself cap the list.
        ids = [it.id for it in db.scalars(select(Item).where(Item.level == 1).order_by(Item.id)).all()]

    assert len(ids) >= 3
    body = client.post("/lessons/complete", json={"item_ids": ids[:3]}, headers=auth).json()
    assert len(body["started"]) == 2
    assert len(body["over_cap"]) == 1


def test_complete_skips_locked_item(client, auth):
    from app.db import SessionLocal
    from app.models import Item
    with SessionLocal() as db:
        lvl2_id = db.scalars(select(Item).where(Item.level == 2)).first().id
    body = client.post("/lessons/complete", json={"item_ids": [lvl2_id]}, headers=auth).json()
    assert lvl2_id in body["skipped"]
    assert lvl2_id not in body["started"]


def test_complete_skips_already_started(client, auth):
    ids = _level1_ids(client, auth)
    first = client.post("/lessons/complete", json={"item_ids": ids[:1]}, headers=auth).json()
    assert ids[0] in first["started"]
    # Second attempt on the same item is skipped, not double-started.
    again = client.post("/lessons/complete", json={"item_ids": ids[:1]}, headers=auth).json()
    assert ids[0] in again["skipped"]
    assert ids[0] not in again["started"]
