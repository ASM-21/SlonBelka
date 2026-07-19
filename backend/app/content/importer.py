"""
Content import: validate and upsert vocabulary items by stable external_id.

This is the single supported way to load or update deck content. It upserts on
external_id, so an existing item keeps its row id (and therefore every bit of
user progress that references it) while its fields are refreshed. Never
truncate-and-reinsert items: that reassigns row ids and orphans user state.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.content.slugs import default_external_id
from app.models import Item

# Columns the importer sets (external_id is handled separately, as the key).
_FIELDS = [
    "type", "level", "lemma", "stressed_form", "translation_primary",
    "translations", "part_of_speech", "gender", "aspect", "ipa",
    "audio_url", "frequency_rank", "notes",
]
_REQUIRED = ["lemma", "stressed_form", "translation_primary", "level"]

# Meanings are what the learner types as an answer; anything longer than this
# is dictionary prose that belongs in `notes`, not in the accept-list. The
# pipeline's curation stage (pipeline/curate.py) produces compliant records.
MAX_TRANSLATION_LEN = 80


def validate_item(rec: dict) -> list[str]:
    """Return a list of problems with a record; an empty list means it is valid."""
    problems: list[str] = []
    for field in _REQUIRED:
        if rec.get(field) in (None, "", []):
            problems.append(f"missing required field '{field}'")
    level = rec.get("level")
    if level is not None and (not isinstance(level, int) or level < 1):
        problems.append("level must be an integer >= 1")
    translations = rec.get("translations")
    if translations is not None and not isinstance(translations, list):
        problems.append("translations must be a list")
    primary = rec.get("translation_primary")
    if isinstance(primary, str) and len(primary) > MAX_TRANSLATION_LEN:
        problems.append(
            f"translation_primary longer than {MAX_TRANSLATION_LEN} chars; "
            "move prose to 'notes' and keep a short answer here"
        )
    if isinstance(translations, list):
        for t in translations:
            if isinstance(t, str) and len(t) > MAX_TRANSLATION_LEN:
                problems.append(
                    f"translation '{t[:40]}...' longer than {MAX_TRANSLATION_LEN} chars"
                )
    return problems


def external_id_for(rec: dict) -> str:
    return rec.get("external_id") or default_external_id(
        rec["lemma"], rec.get("part_of_speech"), rec.get("sense", 0)
    )


def upsert_items(db: Session, records: list[dict]) -> dict:
    """
    Validate, then upsert items keyed on external_id.

    Content is all-or-nothing: if any record is invalid, nothing is written and
    a ValueError lists every problem. Returns counts of created/updated/total.
    """
    errors: list[str] = []
    for i, rec in enumerate(records):
        errors += [f"record {i} ({rec.get('lemma', '?')}): {p}" for p in validate_item(rec)]
    if errors:
        raise ValueError("invalid content, nothing imported:\n" + "\n".join(errors))

    created = updated = 0
    for rec in records:
        ext = external_id_for(rec)
        fields = {k: rec[k] for k in _FIELDS if k in rec}
        existing = db.scalar(select(Item).where(Item.external_id == ext))
        if existing is not None:
            for k, v in fields.items():
                setattr(existing, k, v)
            updated += 1
        else:
            db.add(Item(external_id=ext, **fields))
            created += 1
    db.commit()
    return {"created": created, "updated": updated, "total": len(records)}
