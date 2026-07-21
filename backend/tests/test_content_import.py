"""Tests for content import: stable external_id upsert and validation."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.content.importer import upsert_items, validate_item
from app.models import Item


def _rec(**over):
    base = {
        "lemma": "тест",
        "stressed_form": "те\u0301ст",
        "translation_primary": "test",
        "translations": ["test"],
        "part_of_speech": "noun",
        "level": 3,
    }
    base.update(over)
    return base


def test_upsert_inserts_then_updates_in_place(client):
    from app.db import SessionLocal

    with SessionLocal() as db:
        r1 = upsert_items(db, [_rec()])
        assert r1["created"] == 1 and r1["updated"] == 0
        item = db.scalar(select(Item).where(Item.external_id == "noun:тест:0"))
        assert item is not None
        first_id = item.id

    # Re-importing the same external_id updates in place: no new row, id preserved.
    with SessionLocal() as db:
        r2 = upsert_items(db, [_rec(translations=["test", "exam"])])
        assert r2["created"] == 0 and r2["updated"] == 1
        item = db.scalar(select(Item).where(Item.external_id == "noun:тест:0"))
        assert item.id == first_id
        assert "exam" in item.translations


def test_upsert_preserves_id_of_existing_seed_item(client):
    """The whole point: refreshing content must not reassign row ids."""
    from app.db import SessionLocal

    with SessionLocal() as db:
        before = db.scalar(select(Item).where(Item.external_id == "noun:дом:0"))
        old_id = before.id

    with SessionLocal() as db:
        upsert_items(db, [_rec(lemma="дом", stressed_form="дом",
                               translation_primary="house",
                               translations=["house", "home", "building"], level=1)])
        after = db.scalar(select(Item).where(Item.external_id == "noun:дом:0"))
        assert after.id == old_id
        assert "building" in after.translations


def test_invalid_batch_raises_and_writes_nothing(client):
    from app.db import SessionLocal

    bad = {"lemma": "плохо", "stressed_form": "пло\u0301хо"}  # no translation_primary, no level
    with SessionLocal() as db:
        count_before = db.scalar(select(func.count()).select_from(Item))
        with pytest.raises(ValueError):
            upsert_items(db, [bad])
        count_after = db.scalar(select(func.count()).select_from(Item))
        assert count_before == count_after


def test_validate_item_flags_problems():
    assert validate_item(_rec()) == []
    assert any("level" in p for p in validate_item(_rec(level=0)))
    assert any("translation_primary" in p for p in validate_item(_rec(translation_primary="")))
    assert any("translations" in p for p in validate_item(_rec(translations="test")))


def test_validate_item_rejects_prose_translations():
    prose = (
        "The nineteenth letter of the Russian alphabet, called эс (es) and "
        "written in the Cyrillic script."
    )
    assert any("prose" in p for p in validate_item(_rec(translation_primary=prose)))
    assert any("longer than" in p for p in validate_item(_rec(translations=["ok", prose])))
    # 80 chars exactly is still fine.
    assert validate_item(_rec(translation_primary="x" * 80)) == []


def test_seed_is_idempotent(client):
    """Re-running seed upserts, it does not duplicate."""
    from app.db import SessionLocal
    from app.seed_dev import seed

    with SessionLocal() as db:
        count_before = db.scalar(select(func.count()).select_from(Item))
    created = seed()
    assert created == 0
    with SessionLocal() as db:
        count_after = db.scalar(select(func.count()).select_from(Item))
    assert count_before == count_after
