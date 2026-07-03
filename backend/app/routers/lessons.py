"""Lesson endpoints. The lesson quiz is graded client-side; this commits results."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import CompleteLessonsRequest, LessonItem
from app.services import learning

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.get("", response_model=list[LessonItem])
def list_lessons(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list:
    return learning.get_lessons(db, user)


@router.post("/complete")
def complete(
    body: CompleteLessonsRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Commit the items the learner passed in the client-side quiz. Enforces the
    daily cap and paywall; returns started / over_cap / skipped item ids.
    """
    return learning.complete_lessons(db, user, body.item_ids)
