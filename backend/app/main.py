"""
Slonbelka backend entrypoint.

Phase 0: health check and auth. The SRS engine lives in app/srs/engine.py and is
fully tested; lesson/review/sync endpoints come in later phases (see docs/PHASE0.md).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, engine
from app.middleware import BodySizeLimitMiddleware, RequestLogMiddleware

# Make app loggers (request lines, integration warnings) visible under
# uvicorn, whose own loggers carry their own handlers and are unaffected.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
from app.routers import account, auth, billing, client_errors, dashboard, internal, items, lessons, push, reviews, settings as settings_router, stats, study

# Import models so they register on Base before create_all.
from app import models  # noqa: F401

def _init_sentry() -> None:
    """Initialize Sentry when a DSN is configured. Any failure (a malformed
    DSN, a transport error) only disables error tracking; it must never crash
    the service, so it is caught and logged. No DSN means Sentry stays off
    (dev, tests)."""
    if not settings.sentry_dsn:
        return
    try:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            send_default_pii=False,
            traces_sample_rate=0.0,
        )
    except Exception:
        logging.getLogger("slonbelka").warning(
            "Sentry init failed; continuing without error tracking", exc_info=True
        )


_init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience only. Production uses Alembic migrations.
    if settings.environment != "prod":
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Slonbelka API", version="0.1.0", lifespan=lifespan)

# Middleware order (last added runs outermost): the request log wraps
# everything so every response is timed, CORS next so even 413s carry CORS
# headers, the body limit innermost.
app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLogMiddleware)

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
app.include_router(account.router)
app.include_router(internal.router)
app.include_router(client_errors.router)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "slonbelka", "version": app.version}
