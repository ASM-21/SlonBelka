"""
Billing via Stripe.

Stripe calls are lazy and only happen when keys are configured, so the rest of
the app runs without Stripe. The entitlement-syncing logic (`apply_stripe_event`)
works on plain dicts and is fully testable without the Stripe SDK or live keys.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.timeutil import utcnow as _utcnow
from app.config import settings
from app.models import Subscription, User
from app.services import entitlements


class BillingNotConfigured(Exception):
    pass


class WebhookError(Exception):
    pass


_PRICE_BY_PLAN = {
    "monthly": lambda: settings.stripe_price_monthly,
    "yearly": lambda: settings.stripe_price_yearly,
    "lifetime": lambda: settings.stripe_price_lifetime,
}

# Map Stripe subscription statuses onto ours.
_STATUS_MAP = {
    "active": "active",
    "trialing": "trialing",
    "past_due": "past_due",
    "unpaid": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "canceled",
}



def _epoch_to_dt(epoch: int | None) -> datetime | None:
    return datetime.fromtimestamp(epoch, tz=timezone.utc) if epoch else None


def configured() -> bool:
    return bool(settings.stripe_secret_key)


def _stripe():
    import stripe  # imported lazily; only needed when keys are set

    stripe.api_key = settings.stripe_secret_key
    return stripe


# --------------------------------------------------------------------------- #
# Subscription persistence
# --------------------------------------------------------------------------- #
def _upsert(db: Session, user_id: int, **fields) -> Subscription:
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user_id))
    if sub is None:
        sub = Subscription(user_id=user_id)
        db.add(sub)
    for k, v in fields.items():
        if v is not None:
            setattr(sub, k, v)
    sub.updated_at = _utcnow()
    return sub


# --------------------------------------------------------------------------- #
# Checkout and portal (require live Stripe)
# --------------------------------------------------------------------------- #
def create_checkout(db: Session, user: User, plan: str) -> str:
    if not configured():
        raise BillingNotConfigured("Stripe is not configured")
    price = _PRICE_BY_PLAN.get(plan, lambda: None)()
    if not price:
        raise BillingNotConfigured(f"No price configured for plan '{plan}'")
    stripe = _stripe()

    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    customer_id = sub.stripe_customer_id if sub else None
    if not customer_id:
        customer = stripe.Customer.create(email=user.email, metadata={"user_id": user.id})
        customer_id = customer["id"]
        _upsert(db, user.id, stripe_customer_id=customer_id)
        db.commit()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="payment" if plan == "lifetime" else "subscription",
        line_items=[{"price": price, "quantity": 1}],
        metadata={"user_id": user.id, "plan": plan},
        success_url=settings.billing_success_url,
        cancel_url=settings.billing_cancel_url,
    )
    return session["url"]


# Display prices are read from the configured Stripe Price objects and cached
# in-process so the upgrade page does not hit Stripe on every load. Prices
# change rarely; an hour of staleness is fine.
_PRICES_TTL_SECONDS = 3600
_prices_cache: tuple[datetime, dict] | None = None


def get_prices() -> dict:
    """Fetch display amounts for the configured plans from Stripe.

    Returns {plan: {"amount": int, "currency": str, "interval": str | None}}.
    Unconfigured plans (or unconfigured Stripe) are simply absent, so the
    frontend can fall back gracefully. Never raises: a Stripe hiccup degrades
    to whatever the cache holds, or an empty dict.
    """
    global _prices_cache
    if not configured():
        return {}
    now = _utcnow()
    if _prices_cache is not None and (now - _prices_cache[0]).total_seconds() < _PRICES_TTL_SECONDS:
        return _prices_cache[1]

    stripe = _stripe()
    prices: dict[str, dict] = {}
    for plan, get_id in _PRICE_BY_PLAN.items():
        price_id = get_id()
        if not price_id:
            continue
        try:
            price = stripe.Price.retrieve(price_id)
        except Exception:
            # Keep serving the stale cache rather than blanking the page.
            if _prices_cache is not None:
                return _prices_cache[1]
            return {}
        recurring = price.get("recurring") or {}
        prices[plan] = {
            "amount": price.get("unit_amount") or 0,
            "currency": price.get("currency") or "usd",
            "interval": recurring.get("interval"),
        }
    _prices_cache = (now, prices)
    return prices


def create_portal(db: Session, user: User) -> str:
    if not configured():
        raise BillingNotConfigured("Stripe is not configured")
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if sub is None or not sub.stripe_customer_id:
        raise BillingNotConfigured("No Stripe customer for this user")
    stripe = _stripe()
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id, return_url=settings.billing_success_url
    )
    return session["url"]


# --------------------------------------------------------------------------- #
# Webhooks
# --------------------------------------------------------------------------- #
def parse_webhook(payload: bytes, signature: str | None) -> dict:
    """
    Verify and parse a Stripe webhook. In production a signature and secret are
    required. In dev/test, an unsigned JSON body is accepted for convenience.
    """
    if settings.stripe_webhook_secret and configured():
        stripe = _stripe()
        try:
            return stripe.Webhook.construct_event(
                payload, signature, settings.stripe_webhook_secret
            )
        except Exception as exc:  # signature failure, bad payload
            raise WebhookError(str(exc))
    if settings.environment == "prod":
        raise WebhookError("Webhook secret not configured")
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise WebhookError(str(exc))


def apply_stripe_event(db: Session, event: dict) -> None:
    """Update the Subscription based on a Stripe event. Idempotent per state."""
    etype = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    if etype == "checkout.session.completed":
        meta = obj.get("metadata") or {}
        user_id = meta.get("user_id")
        if user_id is None:
            return
        _upsert(
            db, int(user_id),
            status="active",
            plan=meta.get("plan"),
            stripe_customer_id=obj.get("customer"),
            stripe_subscription_id=obj.get("subscription"),
        )
        db.commit()

    elif etype in ("customer.subscription.created", "customer.subscription.updated"):
        sub = db.scalar(
            select(Subscription).where(Subscription.stripe_customer_id == obj.get("customer"))
        )
        if sub is not None:
            sub.status = _STATUS_MAP.get(obj.get("status", ""), sub.status)
            sub.current_period_end = _epoch_to_dt(obj.get("current_period_end"))
            sub.cancel_at_period_end = bool(obj.get("cancel_at_period_end", False))
            sub.stripe_subscription_id = obj.get("id") or sub.stripe_subscription_id
            sub.updated_at = _utcnow()
            db.commit()

    elif etype == "customer.subscription.deleted":
        sub = db.scalar(
            select(Subscription).where(Subscription.stripe_customer_id == obj.get("customer"))
        )
        if sub is not None:
            sub.status = "canceled"
            sub.updated_at = _utcnow()
            db.commit()

    elif etype == "invoice.payment_failed":
        sub = db.scalar(
            select(Subscription).where(Subscription.stripe_customer_id == obj.get("customer"))
        )
        if sub is not None:
            sub.status = "past_due"
            sub.updated_at = _utcnow()
            db.commit()


def status_for(db: Session, user: User) -> dict:
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    return {
        "is_premium": entitlements.is_premium(db, user),
        "status": sub.status if sub else "none",
        "plan": sub.plan if sub else None,
        "current_period_end": sub.current_period_end if sub else None,
        "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
        "free_level_limit": settings.free_level_limit,
        "current_level": user.current_level,
        "accessible_level": entitlements.accessible_level(db, user),
    }
