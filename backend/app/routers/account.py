"""Account-level endpoints: data export and permanent deletion."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import AccountDeleteRequest
from app.services import account
from app.services.ratelimit import rate_limit

router = APIRouter(prefix="/account", tags=["account"])


@router.get(
    "/export",
    # The export walks every user-owned table; keep it from becoming a
    # cheap way to hammer the database.
    dependencies=[Depends(rate_limit("account_export", limit=10, window_seconds=900))],
)
def export_data(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    return account.export_user_data(db, user)


@router.post(
    "/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("account_delete", limit=5, window_seconds=900))],
)
def delete_account(
    body: AccountDeleteRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    # POST with a body rather than DELETE: the password re-entry belongs in
    # the body and DELETE-with-body support is inconsistent across clients.
    if not account.delete_account(db, user, body.password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Password is incorrect")
