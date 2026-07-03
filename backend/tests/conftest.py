"""Test fixtures. Uses a throwaway sqlite DB and seeds the dev words."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite:///./test_slonbelka.db"
os.environ["JWT_SECRET"] = "test-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def client():
    from app import models  # noqa: F401
    from app.db import Base, engine
    from app.main import app
    from app.seed_dev import seed
    from app.services.email import clear_outbox
    from app.services.ratelimit import reset as reset_rate_limit

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed()
    reset_rate_limit()
    clear_outbox()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth(client):
    """Register a user and return an auth headers dict."""
    r = client.post("/auth/register", json={"email": "t@e.com", "password": "password123"})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_all_due():
    """Force every learned item to be due now (for review-flow tests)."""
    from app.db import SessionLocal
    from app.models import UserItemState

    past = datetime.now(timezone.utc) - timedelta(hours=1)
    with SessionLocal() as db:
        for st in db.query(UserItemState).all():
            st.available_at = past
        db.commit()
