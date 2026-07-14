"""Weekly email digest (D2 reuse)."""

from __future__ import annotations

from app.db import SessionLocal
from app.services import email as email_service
from app.services.email import clear_outbox, get_outbox
from tests.conftest import make_all_due


def _verify(client, headers):
    token = [m for m in get_outbox() if "Verify" in m["subject"]][-1]["token"]
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200


def _register(client, email):
    r = client.post("/auth/register", json={
        "email": email, "password": "password123", "accepted_terms": True,
    })
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_digest_sends_to_verified_active_users(client):
    headers = _register(client, "digest@e.com")
    _verify(client, headers)
    lessons = client.get("/lessons", headers=headers).json()
    client.post("/lessons/complete", headers=headers, json={"item_ids": [lessons[0]["id"]]})
    make_all_due()
    clear_outbox()

    with SessionLocal() as db:
        result = email_service.send_weekly_digests(db)
    assert result["sent"] == 1
    digest = [m for m in get_outbox() if m["to"] == "digest@e.com"]
    assert digest and "weekly" in digest[-1]["subject"].lower()
    assert "review" in digest[-1]["body"].lower()


def test_digest_skips_unverified_and_opted_out(client):
    # Unverified user: never emailed.
    _register(client, "unverified@e.com")
    # Verified but reminders off.
    h2 = _register(client, "optout@e.com")
    _verify(client, h2)
    lessons = client.get("/lessons", headers=h2).json()
    client.post("/lessons/complete", headers=h2, json={"item_ids": [lessons[0]["id"]]})
    client.patch("/settings", headers=h2, json={"reminders_enabled": False})
    clear_outbox()

    with SessionLocal() as db:
        result = email_service.send_weekly_digests(db)
    assert result["sent"] == 0
    assert get_outbox() == []


def test_digest_skips_verified_user_with_no_progress(client):
    headers = _register(client, "fresh@e.com")
    _verify(client, headers)
    clear_outbox()
    with SessionLocal() as db:
        result = email_service.send_weekly_digests(db)
    assert result["sent"] == 0


def test_digest_endpoint_requires_token(client, monkeypatch):
    assert client.post("/internal/email/digest").status_code == 503
    monkeypatch.setattr(email_service.settings, "internal_task_token", "cron-secret")
    # The internal router reads the same setting; a wrong token is rejected.
    from app.config import settings as app_settings

    monkeypatch.setattr(app_settings, "internal_task_token", "cron-secret")
    assert client.post("/internal/email/digest", headers={"X-Internal-Token": "no"}).status_code == 403
    r = client.post("/internal/email/digest", headers={"X-Internal-Token": "cron-secret"})
    assert r.status_code == 200
    assert "sent" in r.json()
