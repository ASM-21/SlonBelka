"""
Example-sentence import: upsert sentences by (item external_id, source_ref).

Same contract as the item importer: never truncate-and-reinsert. Re-running a
load with the same artifact is a zero-diff no-op; a changed translation or
audio URL updates the existing row in place. Records whose item_external_id
is not in the deck are skipped (and reported), not fatal, because a sentence
artifact may cover more lemmas than the currently loaded content.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExampleSentence, Item

_REQUIRED = ["item_external_id", "source_ref", "ru_text", "en_text"]
_FIELDS = ["ru_text", "en_text", "audio_url", "source", "license"]


def validate_sentence(rec: dict) -> list[str]:
    problems: list[str] = []
    for field in _REQUIRED:
        if rec.get(field) in (None, ""):
            problems.append(f"missing required field '{field}'")
    return problems


def upsert_sentences(db: Session, records: list[dict]) -> dict:
    """
    Validate, then upsert sentences keyed on (item_id, source_ref).

    Malformed records abort the whole load (consistent with upsert_items).
    Unknown item external_ids are collected under "skipped" and do not abort.
    Returns counts: {created, updated, skipped, total}.
    """
    errors: list[str] = []
    for i, rec in enumerate(records):
        errors += [
            f"record {i} ({rec.get('source_ref', '?')}): {p}" for p in validate_sentence(rec)
        ]
    if errors:
        raise ValueError("invalid sentences, nothing imported:\n" + "\n".join(errors))

    item_ids: dict[str, int] = {
        external_id: item_id
        for item_id, external_id in db.execute(select(Item.id, Item.external_id)).all()
    }

    created = updated = 0
    skipped: list[str] = []
    for rec in records:
        item_id = item_ids.get(rec["item_external_id"])
        if item_id is None:
            skipped.append(rec["item_external_id"])
            continue
        fields = {k: rec[k] for k in _FIELDS if k in rec}
        existing = db.scalar(
            select(ExampleSentence).where(
                ExampleSentence.item_id == item_id,
                ExampleSentence.source_ref == rec["source_ref"],
            )
        )
        if existing is not None:
            for k, v in fields.items():
                setattr(existing, k, v)
            updated += 1
        else:
            db.add(ExampleSentence(item_id=item_id, source_ref=rec["source_ref"], **fields))
            created += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "total": len(records)}
