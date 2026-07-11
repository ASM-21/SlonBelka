"""Billing endpoints: checkout, customer portal, webhook, and status."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User
from app.routers.auth import current_user
from app.schemas import BillingStatus, CheckoutRequest, UrlResponse
from app.services import billing

router = APIRouter(prefix="/billing", tags=["billing"])

_PLANS = {"monthly", "yearly", "lifetime"}


@router.post("/checkout", response_model=UrlResponse)
def checkout(
    body: CheckoutRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    if body.plan not in _PLANS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown plan")
    # E2: with the flag on, buying premium requires a verified email. Existing
    # subscribers keep what they paid for; only new checkouts are gated.
    if settings.require_email_verification and not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email verification required")
    try:
        return {"url": billing.create_checkout(db, user, body.plan)}
    except billing.BillingNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.post("/portal", response_model=UrlResponse)
def portal(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    try:
        return {"url": billing.create_portal(db, user)}
    except billing.BillingNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        event = billing.parse_webhook(payload, signature)
    except billing.WebhookError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid webhook: {exc}")
    billing.apply_stripe_event(db, event)
    return {"received": True}


@router.get("/status", response_model=BillingStatus)
def billing_status(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return billing.status_for(db, user)
