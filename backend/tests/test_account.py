"""Account data export and deletion (E1)."""

from __future__ import annotations

from app.db import SessionLocal
from app.models import (
    AuthToken,
    LessonEvent,
    Mnemonic,
    PushSubscription,
    ReviewEvent,
    Subscription,
    User,
    UserItemState,
    UserSynonym,
)

USER_TABLES = (
    Mnemonic,
    UserItemState,
    ReviewEvent,
    LessonEvent,
    PushSubscription,
    AuthToken,
    Subscription,
    UserSynonym,
)


def _register(client, email="del@e.com", password="password123"):
    r = client.post("/auth/register", json={
        "email": email, "password": password, "accepted_terms": True,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["refresh_token"]


def _learn_and_review(client, headers):
    """Drive one lesson and one review so the export has real content."""
    lessons = client.get("/lessons", headers=headers).json()
    assert lessons, "dev seed should provide lessons"
    item = lessons[0]
    r = client.post("/lessons/complete", headers=headers, json={"item_ids": [item["id"]]})
    assert r.status_code == 200, r.text
    from tests.conftest import make_all_due

    make_all_due()
    r = client.post("/reviews", headers=headers, json={
        "item_id": item["id"],
        "question_type": "meaning",
        "answer": item["translation_primary"],
        "client_event_id": "export-test-1",
    })
    assert r.status_code == 200, r.text
    return item


def test_export_contains_profile_and_progress(client):
    headers, _ = _register(client, email="exp@e.com")
    item = _learn_and_review(client, headers)

    r = client.get("/account/export", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["profile"]["email"] == "exp@e.com"
    assert data["settings"]["daily_lesson_cap"]
    assert data["subscription"]["status"] == "none"

    # Progress is keyed by external_id, not row id.
    exported_items = {row["item_external_id"] for row in data["items"]}
    assert exported_items and all(eid for eid in exported_items)
    assert len(data["review_history"]) == 1
    assert data["review_history"][0]["correct"] is True
    assert len(data["lesson_history"]) == 1
    del item


def test_delete_with_wrong_password_is_403_and_keeps_data(client):
    headers, _ = _register(client)
    r = client.post("/account/delete", headers=headers, json={"password": "wrong-password"})
    assert r.status_code == 403
    with SessionLocal() as db:
        assert db.query(User).filter(User.email == "del@e.com").count() == 1
        assert db.query(AuthToken).count() > 0


def test_delete_purges_all_user_rows_and_revokes_sessions(client):
    headers, refresh = _register(client)
    _learn_and_review(client, headers)
    client.post("/push/subscribe", headers=headers, json={
        "endpoint": "https://push.example/x", "keys": {"p256dh": "a", "auth": "b"},
    })
    client.post("/items/1/synonyms", headers=headers, json={"text": "extra meaning"})

    with SessionLocal() as db:
        user_id = db.query(User).filter(User.email == "del@e.com").one().id

    r = client.post("/account/delete", headers=headers, json={"password": "password123"})
    assert r.status_code == 204

    with SessionLocal() as db:
        assert db.query(User).filter(User.email == "del@e.com").count() == 0
        for model in USER_TABLES:
            assert db.query(model).filter(model.user_id == user_id).count() == 0, model

    # Old credentials are dead.
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401

    # The email is free again.
    h2, _ = _register(client)
    assert client.get("/auth/me", headers=h2).status_code == 200


def test_delete_nulls_created_by_on_items(client):
    headers, _ = _register(client)
    from app.models import Item

    with SessionLocal() as db:
        user_id = db.query(User).filter(User.email == "del@e.com").one().id
        item = db.query(Item).first()
        item.created_by = user_id
        item_id = item.id
        db.commit()

    assert client.post(
        "/account/delete", headers=headers, json={"password": "password123"}
    ).status_code == 204

    with SessionLocal() as db:
        item = db.get(Item, item_id)
        assert item is not None
        assert item.created_by is None
