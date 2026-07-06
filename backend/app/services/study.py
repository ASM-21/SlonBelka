"""
Leeches, no-stakes practice, and mnemonics.

The leech section is a first-class surface (WaniKani offloads this to add-ons).
Practice here never touches the SRS schedule: it grades and gives feedback only,
so cramming a stubborn word does not artificially advance it. The same grade-only
practice endpoint is reused by extra study later.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app import grading
from app.timeutil import utcnow as _utcnow
from app.models import Item, Mnemonic, User, UserItemState
from app.services.learning import required_types
from app.srs import engine



def _study_set_for_states(db: Session, states: list[UserItemState]) -> list[dict]:
    """Expand a set of states into practice prompts (one per question type)."""
    out: list[dict] = []
    for st in states:
        item = db.get(Item, st.item_id)
        if item is None:
            continue
        for qtype in sorted(required_types(item)):
            out.append({
                "item_id": item.id,
                "question_type": qtype,
                "prompt": item.stressed_form if qtype == "meaning" else item.translation_primary,
                "audio_url": item.audio_url if qtype == "meaning" else None,
                "part_of_speech": item.part_of_speech,
            })
    return out


def get_leeches(db: Session, user: User) -> list[dict]:
    """Current leeches with stats, worst first."""
    states = db.scalars(
        select(UserItemState)
        .where(and_(UserItemState.user_id == user.id, UserItemState.is_leech.is_(True)))
        .order_by(UserItemState.leech_score.desc())
    ).all()
    out: list[dict] = []
    for st in states:
        item = db.get(Item, st.item_id)
        if item is None:
            continue
        attempts = st.correct_count + st.incorrect_count
        out.append({
            "item_id": item.id,
            "stressed_form": item.stressed_form,
            "translation_primary": item.translation_primary,
            "srs_stage": st.srs_stage,
            "stage_name": engine.STAGE_NAMES[st.srs_stage],
            "accuracy": round(st.correct_count / attempts, 3) if attempts else None,
            "incorrect_count": st.incorrect_count,
            "leech_score": round(st.leech_score, 3),
            "last_reviewed_at": st.last_reviewed_at,
        })
    return out


def leech_study_set(db: Session, user: User) -> list[dict]:
    states = db.scalars(
        select(UserItemState).where(
            and_(UserItemState.user_id == user.id, UserItemState.is_leech.is_(True))
        )
    ).all()
    return _study_set_for_states(db, list(states))


def extra_study_set(db: Session, user: User, mode: str, level: int | None = None) -> list[dict]:
    """Free-practice prompts. Modes: recent_mistakes, recently_learned, level, burned."""
    base = select(UserItemState).where(UserItemState.user_id == user.id)
    if mode == "recent_mistakes":
        q = base.where(UserItemState.incorrect_count > 0).order_by(
            UserItemState.last_reviewed_at.desc()
        ).limit(25)
    elif mode == "recently_learned":
        q = base.order_by(UserItemState.unlocked_at.desc()).limit(25)
    elif mode == "level":
        ids = select(Item.id).where(Item.level == (level or user.current_level))
        q = base.where(UserItemState.item_id.in_(ids))
    elif mode == "burned":
        # Practice retired words without resurrecting them; grading never
        # touches the SRS schedule, so burned items stay burned.
        q = base.where(UserItemState.srs_stage == engine.BURNED).order_by(
            UserItemState.burned_at.desc()
        )
    else:
        return []
    return _study_set_for_states(db, list(db.scalars(q).all()))


def grade_practice(db: Session, user: User, item_id: int, question_type: str, answer: str) -> dict:
    """Grade an answer without recording anything or changing the SRS schedule."""
    item = db.get(Item, item_id)
    if item is None:
        return {"error": "item_not_found"}
    if question_type not in required_types(item):
        return {"error": "bad_question_type"}
    if question_type == "meaning":
        grade = grading.grade_meaning(answer, item.translations or [item.translation_primary])
    else:
        grade = grading.grade_production(answer, item.lemma)
    return {
        "correct": grade is grading.Grade.CORRECT,
        "status": grade.value,
        "expected": item.translation_primary if question_type == "meaning" else item.stressed_form,
        "stressed_form": item.stressed_form,
    }


def save_mnemonic(
    db: Session,
    user: User,
    item_id: int,
    meaning_mnemonic: str | None,
    reading_mnemonic: str | None,
) -> dict:
    item = db.get(Item, item_id)
    if item is None:
        return {"error": "item_not_found"}
    m = db.scalar(
        select(Mnemonic).where(
            and_(Mnemonic.item_id == item_id, Mnemonic.user_id == user.id)
        )
    )
    if m is None:
        m = Mnemonic(item_id=item_id, user_id=user.id)
        db.add(m)
    if meaning_mnemonic is not None:
        m.meaning_mnemonic = meaning_mnemonic
    if reading_mnemonic is not None:
        m.reading_mnemonic = reading_mnemonic
    m.updated_at = _utcnow()
    db.commit()
    db.refresh(m)
    return {
        "item_id": item_id,
        "meaning_mnemonic": m.meaning_mnemonic,
        "reading_mnemonic": m.reading_mnemonic,
    }


def get_burned(db: Session, user: User) -> list[dict]:
    """Burned (retired) items, most recently burned first."""
    states = db.scalars(
        select(UserItemState)
        .where(and_(UserItemState.user_id == user.id, UserItemState.srs_stage == engine.BURNED))
        .order_by(UserItemState.burned_at.desc())
    ).all()
    out: list[dict] = []
    for st in states:
        item = db.get(Item, st.item_id)
        if item is None:
            continue
        out.append({
            "item_id": item.id,
            "stressed_form": item.stressed_form,
            "translation_primary": item.translation_primary,
            "level": item.level,
            "burned_at": st.burned_at,
        })
    return out


def resurrect(db: Session, user: User, item_id: int) -> dict:
    """
    Bring a burned item back into the review queue at Apprentice 1, due now.
    Lifetime counts are kept; the streak and leech flag are reset for a fresh
    start. Returns an error if the item is not burned for this user.
    """
    state = db.scalar(
        select(UserItemState).where(
            and_(UserItemState.user_id == user.id, UserItemState.item_id == item_id)
        )
    )
    if state is None or state.srs_stage != engine.BURNED:
        return {"error": "not_burned"}

    now = _utcnow()
    state.srs_stage = engine.APPRENTICE_1
    state.available_at = now  # immediately due so it can be reviewed right away
    state.burned_at = None
    state.passed_at = None
    state.correct_streak = 0
    state.is_leech = False
    state.leech_score = 0.0
    db.commit()
    return {
        "item_id": item_id,
        "srs_stage": state.srs_stage,
        "available_at": state.available_at,
    }
