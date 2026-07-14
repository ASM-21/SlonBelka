"""Per-file audio attribution surfaced on the item detail (E4)."""

from __future__ import annotations

from app.db import SessionLocal
from app.models import AudioAsset, Item


def test_item_detail_carries_audio_attribution(client, auth):
    with SessionLocal() as db:
        item = db.query(Item).first()
        item.audio_url = "https://cdn.example/audio/privet.mp3"
        db.add(AudioAsset(
            key="privet.mp3",
            url="https://cdn.example/audio/privet.mp3",
            source="wiktionary",
            license="CC BY-SA 4.0",
            attribution="Recording by Example Speaker, Wikimedia Commons",
        ))
        item_id = item.id
        db.commit()

    detail = client.get(f"/items/{item_id}", headers=auth).json()
    attr = detail["audio_attribution"]
    assert attr == {
        "source": "wiktionary",
        "license": "CC BY-SA 4.0",
        "attribution": "Recording by Example Speaker, Wikimedia Commons",
    }


def test_item_detail_without_asset_row_has_no_attribution(client, auth):
    with SessionLocal() as db:
        item = db.query(Item).first()
        item.audio_url = "https://cdn.example/audio/unknown.mp3"
        item_id = item.id
        db.commit()

    detail = client.get(f"/items/{item_id}", headers=auth).json()
    assert detail["audio_attribution"] is None
