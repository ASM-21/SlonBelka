"""Infrastructure wiring: Sentry no-op boot, body size limit, email delivery."""

from __future__ import annotations


def test_app_boots_and_health_ok_without_sentry_dsn(client):
    """With no SENTRY_DSN configured the app must boot and serve normally."""
    from app.config import settings

    assert settings.sentry_dsn is None
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
