"""Example-sentence upsert semantics (C2 loader)."""

from __future__ import annotations

import pytest

from app.content.sentences import upsert_sentences
from app.db import SessionLocal
from app.models import ExampleSentence, Item


def _sample_records(external_id: str) -> list[dict]:
    return [
        {
            "item_external_id": external_id,
            "source_ref": "tatoeba:1",
            "ru_text": "Пример.",
            "en_text": "An example.",
            "source": "tatoeba",
            "license": "CC-BY 2.0 FR",
        },
        {
            "item_external_id": external_id,
            "source_ref": "tatoeba:2",
            "ru_text": "Второй пример.",
            "en_text": "A second example.",
            "source": "tatoeba",
            "license": "CC-BY 2.0 FR",
        },
    ]


def test_upsert_creates_and_serves_through_item_detail(client):
    with SessionLocal() as db:
        item = db.query(Item).first()
        item_id, external_id = item.id, item.external_id
        result = upsert_sentences(db, _sample_records(external_id))
    assert result == {"created": 2, "updated": 0, "skipped": [], "total": 2}

    r = client.post("/auth/register", json={
        "email": "s@e.com", "password": "password123", "accepted_terms": True,
    })
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    detail = client.get(f"/items/{item_id}", headers=headers).json()
    texts = {s["ru"] for s in detail["sentences"]}
    assert texts == {"Пример.", "Второй пример."}


def test_rerun_is_zero_diff_and_edits_update_in_place(client):
    with SessionLocal() as db:
        external_id = db.query(Item).first().external_id
        upsert_sentences(db, _sample_records(external_id))
        again = upsert_sentences(db, _sample_records(external_id))
        assert again == {"created": 0, "updated": 2, "skipped": [], "total": 2}
        assert db.query(ExampleSentence).count() == 2

        edited = _sample_records(external_id)
        edited[0]["en_text"] = "A better translation."
        upsert_sentences(db, edited)
        assert db.query(ExampleSentence).count() == 2
        row = db.query(ExampleSentence).filter_by(source_ref="tatoeba:1").one()
        assert row.en_text == "A better translation."


def test_unknown_item_is_skipped_not_fatal(client):
    with SessionLocal() as db:
        external_id = db.query(Item).first().external_id
        records = _sample_records(external_id)[:1] + [
            {
                "item_external_id": "noun:несуществующее:0",
                "source_ref": "tatoeba:9",
                "ru_text": "Х.",
                "en_text": "X.",
            }
        ]
        result = upsert_sentences(db, records)
        assert result["created"] == 1
        assert result["skipped"] == ["noun:несуществующее:0"]


def test_malformed_record_aborts_whole_load(client):
    with SessionLocal() as db:
        external_id = db.query(Item).first().external_id
        records = _sample_records(external_id)
        records[1] = {"item_external_id": external_id, "source_ref": "tatoeba:2", "ru_text": ""}
        with pytest.raises(ValueError):
            upsert_sentences(db, records)
        assert db.query(ExampleSentence).count() == 0
