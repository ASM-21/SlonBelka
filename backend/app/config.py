"""Application settings, read from environment or a .env file."""

from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SECRET = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "dev"  # dev | test | prod

    # Sqlite by default so the app runs with zero setup. docker-compose
    # overrides this with a Postgres URL.
    database_url: str = "sqlite:///./slonbelka_dev.db"

    jwt_secret: str = _DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30

    # If true, premium features require a verified email. Off by default so the
    # demo flow is frictionless; turn on in production.
    require_email_verification: bool = False

    # Free tier: levels at or below this are free; beyond requires a subscription.
    free_level_limit: int = 3

    # Stripe price IDs per plan (set in production).
    stripe_price_monthly: str | None = None
    stripe_price_yearly: str | None = None
    stripe_price_lifetime: str | None = None
    billing_success_url: str = "http://localhost:5173/billing/success"
    billing_cancel_url: str = "http://localhost:5173/billing/cancel"

    frontend_origin: str = "http://localhost:5173"

    # Filled in later (TTS, billing, storage).
    azure_speech_key: str | None = None
    azure_speech_region: str | None = None
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None

    # Error tracking. Unset means Sentry is off (dev, tests).
    sentry_dsn: str | None = None

    # Redis for cross-process rate limiting. Unset means in-memory (dev, tests).
    redis_url: str | None = None

    # Largest accepted request body. Review sync batches and Stripe webhooks
    # are the biggest legitimate payloads and stay well under this.
    max_body_bytes: int = 65536

    @model_validator(mode="after")
    def _require_prod_secret(self) -> "Settings":
        if self.environment == "prod" and self.jwt_secret == _DEFAULT_SECRET:
            raise ValueError("JWT_SECRET must be set to a strong value in production")
        return self


settings = Settings()
