"""Tests for the item browser endpoints."""

from __future__ import annotations

from sqlalchemy import select


def _all_items(client, auth):
    return client.get("/items?limit=100", headers=auth).json()


def test_browse_lists_items_with_total(client, auth):
    body = _all_items(client, auth)
    assert body["total"] >= 14  # seed has at least 14 words
    assert len(body["items"]) == body["total"]
    first = body["items"][0]
    # Seed is ordered by level then frequency, so the first item is level 1.
    assert first["level"] == 1
    assert {"id", "lemma", "translation_primary", "status", "accessible"} <= set(first)


def test_status_reflects_entitlement(client, auth):
    # Fresh user is level 1: level-1 items are available, level-2 items are locked.
    items = _all_items(client, auth)["items"]
    lvl1 = [i for i in items if i["level"] == 1]
    lvl2 = [i for i in items if i["level"] == 2]
    assert lvl1 and all(i["status"] == "available" and i["accessible"] for i in lvl1)
    assert lvl2 and all(i["status"] == "locked" and not i["accessible"] for i in lvl2)


def test_status_reflects_srs_state(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    from app.db import SessionLocal
    from app.models import Item, UserItemState
    with SessionLocal() as db:
        item = db.scalars(select(Item).where(Item.level == 1)).first()
        db.add(UserItemState(user_id=uid, item_id=item.id, srs_stage=5, available_at=None))
        db.commit()
        target_id = item.id
    items = _all_items(client, auth)["items"]
    row = next(i for i in items if i["id"] == target_id)
    assert row["status"] == "guru" and row["srs_stage"] == 5


def test_level_filter(client, auth):
    all_items = _all_items(client, auth)["items"]
    lvl1_count = sum(1 for i in all_items if i["level"] == 1)
    body = client.get("/items?level=1", headers=auth).json()
    assert body["total"] == lvl1_count
    assert all(i["level"] == 1 for i in body["items"])


def test_search_matches_translation(client, auth):
    items = _all_items(client, auth)["items"]
    target = items[0]
    needle = target["translation_primary"][:3]
    body = client.get(f"/items?search={needle}", headers=auth).json()
    assert any(i["id"] == target["id"] for i in body["items"])


def test_pagination(client, auth):
    page1 = client.get("/items?limit=5&offset=0", headers=auth).json()
    page2 = client.get("/items?limit=5&offset=5", headers=auth).json()
    assert len(page1["items"]) == 5
    ids1 = {i["id"] for i in page1["items"]}
    ids2 = {i["id"] for i in page2["items"]}
    assert ids1.isdisjoint(ids2)


def test_detail_returns_sentences_and_state(client, auth):
    uid = client.get("/auth/me", headers=auth).json()["id"]
    item_id = _all_items(client, auth)["items"][0]["id"]

    from app.db import SessionLocal
    from app.models import ExampleSentence, UserItemState
    with SessionLocal() as db:
        db.add(ExampleSentence(item_id=item_id, ru_text="Это тест.", en_text="This is a test."))
        db.add(UserItemState(user_id=uid, item_id=item_id, srs_stage=3,
                             correct_count=4, incorrect_count=1, correct_streak=2))
        db.commit()

    detail = client.get(f"/items/{item_id}", headers=auth).json()
    assert detail["id"] == item_id
    assert detail["sentences"] and detail["sentences"][0]["en"] == "This is a test."
    assert detail["state"]["srs_stage"] == 3
    assert detail["state"]["srs_band"] == "apprentice"
    assert detail["state"]["correct_count"] == 4


def test_detail_404_for_missing(client, auth):
    assert client.get("/items/999999", headers=auth).status_code == 404


def test_browse_requires_auth(client):
    assert client.get("/items").status_code in (401, 403)
