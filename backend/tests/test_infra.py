"""Infrastructure wiring: Sentry no-op boot, body size limit, email delivery."""

from __future__ import annotations


def test_app_boots_and_health_ok_without_sentry_dsn(client):
    """With no SENTRY_DSN configured the app must boot and serve normally."""
    from app.config import settings

    assert settings.sentry_dsn is None
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_email_uses_resend_when_configured(monkeypatch):
    from app.services import email

    sent = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent["url"] = url
        sent["headers"] = headers
        sent["json"] = json

        class Response:
            status_code = 200
            text = "ok"

        return Response()

    monkeypatch.setattr(email.settings, "resend_api_key", "re_test_123")
    monkeypatch.setattr(email.httpx, "post", fake_post)
    email.clear_outbox()
    email.send_verification_email("u@e.com", "tok123")

    assert sent["url"] == "https://api.resend.com/emails"
    assert sent["headers"]["Authorization"] == "Bearer re_test_123"
    assert sent["json"]["to"] == ["u@e.com"]
    assert "/?verify=tok123" in sent["json"]["text"]
    # A real send must not land in the dev outbox.
    assert email.get_outbox() == []


def test_email_send_failure_does_not_raise(monkeypatch):
    import httpx

    from app.services import email

    def broken_post(*args, **kwargs):
        raise httpx.ConnectError("provider down")

    monkeypatch.setattr(email.settings, "resend_api_key", "re_test_123")
    monkeypatch.setattr(email.httpx, "post", broken_post)
    email.send_password_reset_email("u@e.com", "tok")  # must not raise


def test_request_log_line_emitted(client, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="slonbelka.request"):
        client.get("/dashboard")  # 401 without auth, still logged
    lines = [r.getMessage() for r in caplog.records if r.name == "slonbelka.request"]
    assert any("path=/dashboard" in line and "status=401" in line for line in lines)


def test_health_is_not_request_logged(client, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="slonbelka.request"):
        client.get("/health")
    assert not [r for r in caplog.records if r.name == "slonbelka.request"]


def test_checkout_requires_verified_email_when_flag_on(client, auth, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "require_email_verification", True)
    r = client.post("/billing/checkout", headers=auth, json={"plan": "monthly"})
    assert r.status_code == 403

    # Verify via the token from the outbox, then the gate opens (503 next,
    # because Stripe is not configured in tests, which proves we got past it).
    from app.services.email import get_outbox

    token = [m for m in get_outbox() if "Verify" in m["subject"]][-1]["token"]
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    r = client.post("/billing/checkout", headers=auth, json={"plan": "monthly"})
    assert r.status_code == 503


def test_outbox_links_use_root_query_params(client):
    from app.services.email import get_outbox

    client.post("/auth/register", json={
        "email": "links@e.com", "password": "password123", "accepted_terms": True,
    })
    client.post("/auth/forgot-password", json={"email": "links@e.com"})
    msgs = [m for m in get_outbox() if m["to"] == "links@e.com"]
    assert any("/?verify=" in m["body"] for m in msgs)
    assert any("/?reset=" in m["body"] for m in msgs)
