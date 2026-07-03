"""
Item browser: browse, search, and detail views over the vocabulary, annotated
with the requesting user's SRS state and entitlement (locked / available / band).
"""

from __future__ import annotations

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import ExampleSentence, Item, Mnemonic, User, UserItemState
from app.services import entitlements
from app.services import synonyms
from app.srs import engine

MAX_LIMIT = 100


def _status(item: Item, state: UserItemState | None, max_level: int) -> str:
    if state is not None:
        return engine.band(state.srs_stage)
    return "available" if item.level <= max_level else "locked"


def _summary(item: Item, state: UserItemState | None, max_level: int) -> dict:
    return {
        "id": item.id,
        "lemma": item.lemma,
        "stressed_form": item.stressed_form,
        "translation_primary": item.translation_primary,
        "part_of_speech": item.part_of_speech,
        "level": item.level,
        "frequency_rank": item.frequency_rank,
        "status": _status(item, state, max_level),
        "srs_stage": state.srs_stage if state else None,
        "available_at": state.available_at if state else None,
        "is_leech": state.is_leech if state else False,
        "accessible": item.level <= max_level,
    }


def browse(
    db: Session,
    user: User,
    *,
    search: str | None = None,
    level: int | None = None,
    pos: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    limit = max(1, min(limit, MAX_LIMIT))
    offset = max(0, offset)
    max_level = entitlements.accessible_level(db, user)

    conds = []
    if level is not None:
        conds.append(Item.level == level)
    if pos:
        conds.append(Item.part_of_speech == pos)
    if search and search.strip():
        term = f"%{search.strip()}%"
        # NOTE: sqlite ILIKE is ASCII-only; Postgres handles Cyrillic case folding.
        conds.append(or_(
            Item.lemma.ilike(term),
            Item.stressed_form.ilike(term),
            Item.translation_primary.ilike(term),
        ))
    where = and_(*conds) if conds else True

    total = db.scalar(select(func.count()).select_from(Item).where(where)) or 0
    rows = db.execute(
        select(Item, UserItemState)
        .outerjoin(
            UserItemState,
            and_(UserItemState.item_id == Item.id, UserItemState.user_id == user.id),
        )
        .where(where)
        .order_by(Item.level, Item.frequency_rank, Item.id)
        .limit(limit)
        .offset(offset)
    ).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_summary(item, state, max_level) for item, state in rows],
    }


def detail(db: Session, user: User, item_id: int) -> dict | None:
    item = db.get(Item, item_id)
    if item is None:
        return None
    max_level = entitlements.accessible_level(db, user)
    state = db.scalar(
        select(UserItemState).where(
            and_(UserItemState.item_id == item_id, UserItemState.user_id == user.id)
        )
    )
    sentences = db.scalars(
        select(ExampleSentence).where(ExampleSentence.item_id == item_id)
    ).all()
    mnemonic = db.scalar(
        select(Mnemonic).where(
            and_(Mnemonic.item_id == item_id, Mnemonic.user_id == user.id)
        )
    )

    out = _summary(item, state, max_level)
    out.update({
        "translations": item.translations or [],
        "synonyms": synonyms.get_synonyms(db, user.id, item_id),
        "gender": item.gender,
        "aspect": item.aspect,
        "ipa": item.ipa,
        "audio_url": item.audio_url,
        "notes": item.notes,
        "sentences": [
            {"ru": s.ru_text, "en": s.en_text, "audio_url": s.audio_url} for s in sentences
        ],
        "mnemonic": (
            {"meaning": mnemonic.meaning_mnemonic, "reading": mnemonic.reading_mnemonic}
            if mnemonic else None
        ),
        "state": (
            {
                "srs_stage": state.srs_stage,
                "srs_band": engine.band(state.srs_stage),
                "available_at": state.available_at,
                "last_reviewed_at": state.last_reviewed_at,
                "correct_count": state.correct_count,
                "incorrect_count": state.incorrect_count,
                "correct_streak": state.correct_streak,
                "is_leech": state.is_leech,
                "leech_score": state.leech_score,
                "unlocked_at": state.unlocked_at,
                "passed_at": state.passed_at,
                "burned_at": state.burned_at,
            }
            if state else None
        ),
    })
    return out
