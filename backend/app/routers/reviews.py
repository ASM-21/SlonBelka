"""Review endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import (
    ForecastResponse,
    ReviewItem,
    SubmitReviewRequest,
    SubmitReviewResponse,
    SyncRequest,
    SyncResponse,
)
from app.services import learning
from app.services.dashboard import build_forecast

router = APIRouter(prefix="/reviews", tags=["reviews"])

_ERRORS = {
    "item_not_found": (status.HTTP_404_NOT_FOUND, "Item not found"),
    "bad_question_type": (status.HTTP_400_BAD_REQUEST, "Invalid question type for item"),
    "not_started": (status.HTTP_409_CONFLICT, "Item has not been learned yet"),
    "not_due": (status.HTTP_409_CONFLICT, "Item is not due for review"),
}


@router.get("", response_model=list[ReviewItem])
def list_reviews(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list:
    return learning.get_reviews(db, user)


@router.get("/forecast", response_model=ForecastResponse)
def forecast(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    return build_forecast(db, user)


@router.post("", response_model=SubmitReviewResponse)
def submit(
    body: SubmitReviewRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    result = learning.submit_review(
        db,
        user,
        item_id=body.item_id,
        question_type=body.question_type,
        answer=body.answer,
        client_event_id=body.client_event_id,
        answered_at=body.answered_at,
        override=body.override,
    )
    if "error" in result:
        code, detail = _ERRORS.get(result["error"], (status.HTTP_400_BAD_REQUEST, result["error"]))
        raise HTTPException(code, detail)
    return result


@router.post("/sync", response_model=SyncResponse)
def sync(
    body: SyncRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    events = [e.model_dump() for e in body.events]
    return {"results": learning.sync_reviews(db, user, events)}
