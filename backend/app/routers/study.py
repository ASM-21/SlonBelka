"""Leeches, extra study, no-stakes practice, and mnemonics."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import (
    BurnedItem,
    LeechItem,
    MnemonicRequest,
    MnemonicResponse,
    PracticeRequest,
    PracticeResult,
    ResurrectResponse,
    ReviewItem,
)
from app.services import study

router = APIRouter(tags=["study"])


@router.get("/burned", response_model=list[BurnedItem])
def burned(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list:
    return study.get_burned(db, user)


@router.post("/items/{item_id}/resurrect", response_model=ResurrectResponse)
def resurrect(
    item_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    res = study.resurrect(db, user, item_id)
    if "error" in res:
        raise HTTPException(status.HTTP_409_CONFLICT, "Item is not burned")
    return res


@router.get("/leeches", response_model=list[LeechItem])
def list_leeches(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list:
    return study.get_leeches(db, user)


@router.post("/leeches/study", response_model=list[ReviewItem])
def leech_study(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list:
    return study.leech_study_set(db, user)


@router.get("/extra-study", response_model=list[ReviewItem])
def extra_study(
    mode: str,
    level: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list:
    return study.extra_study_set(db, user, mode, level)


@router.post("/practice", response_model=PracticeResult)
def practice(
    body: PracticeRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    result = study.grade_practice(db, user, body.item_id, body.question_type, body.answer)
    if "error" in result:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, result["error"])
    return result


@router.put("/items/{item_id}/mnemonic", response_model=MnemonicResponse)
def put_mnemonic(
    item_id: int,
    body: MnemonicRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    result = study.save_mnemonic(db, user, item_id, body.meaning_mnemonic, body.reading_mnemonic)
    if "error" in result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return result
