"""Client error intake endpoint."""

from __future__ import annotations

from app.services.ratelimit import reset as reset_rate_limit


def test_client_error_accepted_without_auth(client):
    r = client.post("/client-errors", json={"message": "boom", "kind": "window"})
    assert r.status_code == 204


def test_client_error_rejects_oversized_fields(client):
    r = client.post("/client-errors", json={"message": "x" * 2001})
    assert r.status_code == 422


def test_client_error_is_rate_limited(client):
    reset_rate_limit()
    codes = [
        client.post("/client-errors", json={"message": "spam"}).status_code
        for _ in range(35)
    ]
    assert 429 in codes
