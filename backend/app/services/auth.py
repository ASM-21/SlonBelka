"""
Auth token lifecycle: refresh tokens with rotation and revocation, email
verification, and password reset. The pure JWT/hashing helpers live in
app.security; this module is the database-touching layer.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session

from app.timeutil import aware as _aware, utcnow as _utcnow
from app.config import settings
from app.models import AuthToken, User
from app.security import (
    create_access_token,
    generate_token,
    hash_password,
    hash_token,
)

REFRESH = "refresh"
EMAIL_VERIFY = "email_verify"
PASSWORD_RESET = "password_reset"

VERIFY_TTL = timedelta(hours=24)
RESET_TTL = timedelta(hours=1)




def _mint(db: Session, user_id: int, ttype: str, ttl: timedelta) -> str:
    raw = generate_token()
    db.add(AuthToken(
        user_id=user_id,
        type=ttype,
        token_hash=hash_token(raw),
        expires_at=_utcnow() + ttl,
    ))
    return raw


def _find_valid(db: Session, raw: str, ttype: str) -> AuthToken | None:
    row = db.scalar(
        select(AuthToken).where(
            and_(
                AuthToken.token_hash == hash_token(raw),
                AuthToken.type == ttype,
                AuthToken.revoked.is_(False),
            )
        )
    )
    if row is None or _aware(row.expires_at) < _utcnow():
        return None
    return row


# --------------------------------------------------------------------------- #
# Refresh tokens
# --------------------------------------------------------------------------- #
def issue_tokens(db: Session, user: User) -> tuple[str, str]:
    """A fresh access + refresh pair."""
    access = create_access_token(str(user.id))
    refresh = _mint(db, user.id, REFRESH, timedelta(days=settings.refresh_token_days))
    db.commit()
    return access, refresh


def rotate_refresh(db: Session, raw: str) -> tuple[str, str] | None:
    """Validate a refresh token, revoke it, and issue a new pair. Rotation."""
    row = _find_valid(db, raw, REFRESH)
    if row is None:
        return None
    row.revoked = True
    user = db.get(User, row.user_id)
    if user is None:
        db.commit()
        return None
    access = create_access_token(str(user.id))
    refresh = _mint(db, user.id, REFRESH, timedelta(days=settings.refresh_token_days))
    db.commit()
    return access, refresh


def revoke_refresh(db: Session, raw: str) -> None:
    row = _find_valid(db, raw, REFRESH)
    if row is not None:
        row.revoked = True
        db.commit()


def revoke_all_refresh(db: Session, user_id: int) -> None:
    db.execute(
        update(AuthToken)
        .where(and_(AuthToken.user_id == user_id, AuthToken.type == REFRESH, AuthToken.revoked.is_(False)))
        .values(revoked=True)
    )
    db.commit()


# --------------------------------------------------------------------------- #
# Email verification
# --------------------------------------------------------------------------- #
def create_verification(db: Session, user: User) -> str:
    raw = _mint(db, user.id, EMAIL_VERIFY, VERIFY_TTL)
    db.commit()
    return raw


def verify_email(db: Session, raw: str) -> bool:
    row = _find_valid(db, raw, EMAIL_VERIFY)
    if row is None:
        return False
    row.revoked = True  # single use
    user = db.get(User, row.user_id)
    if user is not None:
        user.email_verified = True
    db.commit()
    return True


# --------------------------------------------------------------------------- #
# Password reset
# --------------------------------------------------------------------------- #
def create_reset(db: Session, user: User) -> str:
    raw = _mint(db, user.id, PASSWORD_RESET, RESET_TTL)
    db.commit()
    return raw


def reset_password(db: Session, raw: str, new_password: str) -> bool:
    row = _find_valid(db, raw, PASSWORD_RESET)
    if row is None:
        return False
    row.revoked = True
    user = db.get(User, row.user_id)
    if user is None:
        db.commit()
        return False
    user.password_hash = hash_password(new_password)
    db.commit()
    # Reset invalidates existing sessions.
    revoke_all_refresh(db, user.id)
    return True
