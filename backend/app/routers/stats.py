"""Progress statistics endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import StatsResponse
from app.services import stats as stats_service

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsResponse)
def get_stats(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return stats_service.build_stats(db, user)
