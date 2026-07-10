"""
Internal task endpoints, triggered by an external cron (GitHub Actions or
Railway cron), never by browsers. Authenticated with a shared token so the
sweep cannot be fired by strangers; 503 when the token is not configured.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.services import push as push_service

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    if not settings.internal_task_token:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Internal tasks are not configured")
    if x_internal_token != settings.internal_task_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid internal token")


@router.post("/push/run", dependencies=[Depends(_require_internal_token)])
def run_push_reminders(db: Session = Depends(get_db)) -> dict:
    return push_service.send_review_reminders(db)
