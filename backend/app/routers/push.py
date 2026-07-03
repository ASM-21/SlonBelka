"""
Web push subscription storage.

Stores the browser's push subscription so reminders can be sent later. Actual
delivery (a scheduler plus pywebpush with VAPID keys) is server infrastructure
and is intentionally out of scope for this scaffold; this just persists the
subscription, upserting on (user, endpoint).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, delete, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PushSubscription, User
from app.routers.auth import current_user
from app.schemas import PushSubscribeRequest

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/subscribe")
def subscribe(
    body: PushSubscribeRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.scalar(
        select(PushSubscription).where(
            and_(PushSubscription.user_id == user.id, PushSubscription.endpoint == body.endpoint)
        )
    )
    if existing is not None:
        existing.keys = body.keys
    else:
        db.add(PushSubscription(user_id=user.id, endpoint=body.endpoint, keys=body.keys))
    db.commit()
    return {"subscribed": True}


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    endpoint: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    db.execute(
        delete(PushSubscription).where(
            and_(PushSubscription.user_id == user.id, PushSubscription.endpoint == endpoint)
        )
    )
    db.commit()
