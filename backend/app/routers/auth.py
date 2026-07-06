"""Auth endpoints: registration, login, refresh, logout, verification, reset."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.security import decode_access_token, hash_password, verify_password
from app.services import auth as auth_service
from app.services import email as email_service
from app.services.ratelimit import rate_limit
from app.timeutil import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=True)

# Rate limits (per IP). Backed by an in-memory store; use Redis in production.
_register_limit = rate_limit("register", limit=20, window_seconds=300)
_login_limit = rate_limit("login", limit=10, window_seconds=60)
_forgot_limit = rate_limit("forgot", limit=5, window_seconds=900)


def current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(creds.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(_register_limit)])
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if not body.accepted_terms:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You must accept the Terms of Service and Privacy Policy",
        )
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        tos_accepted_at=utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth_service.create_verification(db, user)
    email_service.send_verification_email(user.email, token)
    access, refresh = auth_service.issue_tokens(db, user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(_login_limit)])
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    access, refresh = auth_service.issue_tokens(db, user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    pair = auth_service.rotate_refresh(db, body.refresh_token)
    if pair is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    access, new_refresh = pair
    return TokenResponse(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest, db: Session = Depends(get_db)) -> None:
    auth_service.revoke_refresh(db, body.refresh_token)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(user: User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    auth_service.revoke_all_refresh(db, user.id)


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict:
    if not auth_service.verify_email(db, body.token):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    return {"verified": True}


@router.post("/resend-verification")
def resend_verification(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if user.email_verified:
        return {"verified": True}
    token = auth_service.create_verification(db, user)
    email_service.send_verification_email(user.email, token)
    return {"sent": True}


@router.post("/forgot-password", dependencies=[Depends(_forgot_limit)])
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is not None:
        token = auth_service.create_reset(db, user)
        email_service.send_password_reset_email(user.email, token)
    # Always 200 to avoid leaking which emails are registered.
    return {"sent": True}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict:
    if not auth_service.reset_password(db, body.token, body.new_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    return {"reset": True}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)) -> User:
    return user
