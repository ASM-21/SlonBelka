"""User-defined synonyms (extra accepted meanings) for items."""

from __future__ import annotations

from sqlalchemy import and_, delete, select
from sqlalchemy.orm import Session

from app.models import UserSynonym

MAX_PER_ITEM = 20
MAX_LEN = 100


def get_synonyms(db: Session, user_id: int, item_id: int) -> list[str]:
    return list(
        db.scalars(
            select(UserSynonym.text)
            .where(and_(UserSynonym.user_id == user_id, UserSynonym.item_id == item_id))
            .order_by(UserSynonym.id)
        ).all()
    )


def add_synonym(db: Session, user_id: int, item_id: int, text: str) -> list[str]:
    """Add a synonym (idempotent, capped, length-limited). Returns the new list."""
    cleaned = " ".join(text.strip().split())[:MAX_LEN]
    current = get_synonyms(db, user_id, item_id)
    if not cleaned:
        return current
    # Case-insensitive dedupe and cap.
    if any(s.lower() == cleaned.lower() for s in current):
        return current
    if len(current) >= MAX_PER_ITEM:
        return current
    db.add(UserSynonym(user_id=user_id, item_id=item_id, text=cleaned))
    db.commit()
    return get_synonyms(db, user_id, item_id)


def remove_synonym(db: Session, user_id: int, item_id: int, text: str) -> list[str]:
    """Remove a synonym (case-insensitive match). Returns the remaining list."""
    cleaned = " ".join(text.strip().split())
    db.execute(
        delete(UserSynonym).where(
            and_(
                UserSynonym.user_id == user_id,
                UserSynonym.item_id == item_id,
                # case-insensitive
                UserSynonym.text.ilike(cleaned),
            )
        )
    )
    db.commit()
    return get_synonyms(db, user_id, item_id)
