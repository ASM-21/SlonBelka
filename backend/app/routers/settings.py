"""Settings and vacation-mode endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import SettingsPatch, SettingsResponse, VacationRequest, VacationResponse
from app.services import account

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
def get_settings(user: User = Depends(current_user)) -> dict:
    return account.get_settings(user)


@router.patch("", response_model=SettingsResponse)
def update_settings(
    body: SettingsPatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return account.update_settings(db, user, body.model_dump(exclude_none=True))


@router.post("/vacation", response_model=VacationResponse)
def vacation(
    body: VacationRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return account.set_vacation(db, user, body.on)
