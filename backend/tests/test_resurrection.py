"""Tests for burned-item resurrection."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select


def _burn_a_level1_item(uid: int) -> int:
    """Create a burned state for a level-1 item and return its id."""
    from app.db import SessionLocal
    from app.models import Item, UserItemState
    with SessionLocal() as db:
        item = db.scalars(select(Item).where(Item.level == 1)).first()
        db.add(UserItemState(
            user_id=uid,
            item_id=item.id,
            srs_stage=9,  # BURNED
            available_at=None,
            burned_at=datetime.now(timezone.utc),
            correct_count=10,
            incorrect_count=1,
        ))
        db.commit()
        return item.id


def test_burned_list(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item_id = _burn_a_level1_item(uid)
    r = client.get("/burned", headers=auth)
    assert r.status_code == 200
    assert any(b["item_id"] == item_id for b in r.json())


def test_resurrect_returns_to_apprentice_due_now(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item_id = _burn_a_level1_item(uid)
    r = client.post(f"/items/{item_id}/resurrect", headers=auth)
    assert r.status_code == 200
    assert r.json()["srs_stage"] == 1

    from app.db import SessionLocal
    from app.models import UserItemState
    with SessionLocal() as db:
        st = db.scalar(
            select(UserItemState).where(
                (UserItemState.user_id == uid) & (UserItemState.item_id == item_id)
            )
        )
        assert st.srs_stage == 1
        assert st.burned_at is None
        assert st.available_at is not None


def test_resurrected_item_surfaces_in_reviews(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item_id = _burn_a_level1_item(uid)
    # Not due while burned (available_at is None).
    assert all(r["item_id"] != item_id for r in client.get("/reviews", headers=auth).json())
    client.post(f"/items/{item_id}/resurrect", headers=auth)
    # Now due.
    assert any(r["item_id"] == item_id for r in client.get("/reviews", headers=auth).json())


def test_resurrect_non_burned_is_409(client, auth):
    # A freshly started (non-burned) item cannot be resurrected.
    uid = client.get("/auth/me", headers=auth).json()["id"]
    from app.db import SessionLocal
    from app.models import Item, UserItemState
    with SessionLocal() as db:
        item = db.scalars(select(Item).where(Item.level == 1)).first()
        db.add(UserItemState(user_id=uid, item_id=item.id, srs_stage=1))
        db.commit()
        item_id = item.id
    assert client.post(f"/items/{item_id}/resurrect", headers=auth).status_code == 409


def test_resurrect_unknown_item_is_409(client, auth):
    assert client.post("/items/999999/resurrect", headers=auth).status_code == 409
