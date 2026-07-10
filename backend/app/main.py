"""
Slonbelka backend entrypoint.

Phase 0: health check and auth. The SRS engine lives in app/srs/engine.py and is
fully tested; lesson/review/sync endpoints come in later phases (see docs/PHASE0.md).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, engine
from app.routers import auth, billing, dashboard, items, lessons, push, reviews, settings as settings_router, stats, study

# Import models so they register on Base before create_all.
from app import models  # noqa: F401

# No DSN means Sentry stays off (dev, tests). The FastAPI/Starlette
# integration is enabled automatically by the SDK.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=False,
        traces_sample_rate=0.0,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience only. Production uses Alembic migrations.
    if settings.environment != "prod":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Slonbelka API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(lessons.router)
app.include_router(reviews.router)
app.include_router(dashboard.router)
app.include_router(study.router)
app.include_router(billing.router)
app.include_router(items.router)
app.include_router(push.router)
app.include_router(stats.router)
app.include_router(settings_router.router)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "slonbelka", "version": app.version}
