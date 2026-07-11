"""Review forecast endpoint."""

from __future__ import annotations

from datetime import timedelta

from app.db import SessionLocal
from app.models import UserItemState
from app.timeutil import utcnow


def _learn(client, auth, n=3):
    lessons = client.get("/lessons", headers=auth).json()
    ids = [it["id"] for it in lessons[:n]]
    r = client.post("/lessons/complete", headers=auth, json={"item_ids": ids})
    assert r.status_code == 200, r.text
    return ids


def test_forecast_buckets(client, auth):
    ids = _learn(client, auth, n=3)
    now = utcnow()
    with SessionLocal() as db:
        states = db.query(UserItemState).filter(UserItemState.item_id.in_(ids)).all()
        assert len(states) == 3
        states[0].available_at = now - timedelta(minutes=5)   # due now
        states[1].available_at = now + timedelta(hours=3)     # hour bucket 3, day 0
        states[2].available_at = now + timedelta(days=2, hours=1)  # day bucket 2
        db.commit()

    f = client.get("/reviews/forecast", headers=auth).json()
    assert f["frozen"] is False
    assert f["due_now"] == 1
    assert len(f["hourly"]) == 24 and len(f["daily"]) == 7
    assert f["hourly"][3] == 1
    assert sum(f["hourly"]) == 1
    assert f["daily"][0] == 1
    assert f["daily"][2] == 1
    assert sum(f["daily"]) == 2


def test_forecast_frozen_is_empty(client, auth):
    _learn(client, auth, n=1)
    client.post("/settings/vacation", headers=auth, json={"on": True})
    f = client.get("/reviews/forecast", headers=auth).json()
    assert f["frozen"] is True
    assert f["due_now"] == 0
    assert sum(f["hourly"]) == 0 and sum(f["daily"]) == 0
