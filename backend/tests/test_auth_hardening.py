"""Tests for the hardened auth flows."""

from __future__ import annotations

from app.services.email import get_outbox
from app.services.ratelimit import reset as reset_rate_limit


def _register(client, email="x@e.com", password="password123", accepted_terms=True):
    return client.post("/auth/register", json={
        "email": email, "password": password, "accepted_terms": accepted_terms,
    })


def test_register_returns_access_and_refresh(client):
    r = _register(client)
    assert r.status_code == 201
    body = r.json()
    assert body["access_token"] and body["refresh_token"]


def test_register_requires_accepted_terms(client):
    r = _register(client, accepted_terms=False)
    assert r.status_code == 400
    # Omitting the field entirely is also a refusal (defaults to false).
    r2 = client.post("/auth/register", json={"email": "y@e.com", "password": "password123"})
    assert r2.status_code == 400


def test_register_records_tos_acceptance_time(client):
    _register(client, email="tos@e.com")
    from app.db import SessionLocal
    from app.models import User
    from sqlalchemy import select

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "tos@e.com"))
        assert user is not None and user.tos_accepted_at is not None


def test_register_sends_verification_email(client):
    _register(client, email="v@e.com")
    sent = [m for m in get_outbox() if m["to"] == "v@e.com"]
    assert sent and "Verify" in sent[-1]["subject"]


def test_password_min_length(client):
    r = _register(client, password="short")
    assert r.status_code == 422


def test_refresh_rotates_and_old_token_is_rejected(client):
    refresh = _register(client).json()["refresh_token"]
    r1 = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r1.status_code == 200
    new_refresh = r1.json()["refresh_token"]
    assert new_refresh != refresh
    # The rotated-out token must no longer work.
    r2 = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 401
    # The new one works.
    assert client.post("/auth/refresh", json={"refresh_token": new_refresh}).status_code == 200


def test_logout_revokes_refresh(client):
    refresh = _register(client).json()["refresh_token"]
    assert client.post("/auth/logout", json={"refresh_token": refresh}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_logout_all_revokes_every_refresh(client):
    tok = _register(client).json()
    access, refresh = tok["access_token"], tok["refresh_token"]
    # Issue a second refresh via login.
    refresh2 = client.post("/auth/login", json={"email": "x@e.com", "password": "password123"}).json()["refresh_token"]
    r = client.post("/auth/logout-all", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": refresh2}).status_code == 401


def test_email_verification_flow(client):
    access = _register(client, email="ver@e.com").json()["access_token"]
    headers = {"Authorization": f"Bearer {access}"}
    assert client.get("/auth/me", headers=headers).json()["email_verified"] is False
    token = [m for m in get_outbox() if m["to"] == "ver@e.com"][-1]["token"]
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 200
    assert client.get("/auth/me", headers=headers).json()["email_verified"] is True
    # Token is single-use.
    assert client.post("/auth/verify-email", json={"token": token}).status_code == 400


def test_password_reset_flow(client):
    _register(client, email="reset@e.com", password="password123")
    old_refresh = client.post("/auth/login", json={"email": "reset@e.com", "password": "password123"}).json()["refresh_token"]
    assert client.post("/auth/forgot-password", json={"email": "reset@e.com"}).status_code == 200
    token = [m for m in get_outbox() if m["to"] == "reset@e.com" and m["subject"].startswith("Reset")][-1]["token"]
    assert client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword1"}).status_code == 200
    # Old password fails, new one works.
    assert client.post("/auth/login", json={"email": "reset@e.com", "password": "password123"}).status_code == 401
    assert client.post("/auth/login", json={"email": "reset@e.com", "password": "newpassword1"}).status_code == 200
    # Reset revoked existing sessions.
    assert client.post("/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401


def test_forgot_password_does_not_leak_accounts(client):
    # Unknown email still returns 200.
    assert client.post("/auth/forgot-password", json={"email": "nobody@e.com"}).status_code == 200


def test_login_rate_limited(client):
    reset_rate_limit()
    _register(client, email="rl@e.com", password="password123")
    # Login limit is 10/min; the 11th attempt should be throttled.
    codes = [
        client.post("/auth/login", json={"email": "rl@e.com", "password": "wrong"}).status_code
        for _ in range(12)
    ]
    assert 429 in codes
