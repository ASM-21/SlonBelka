"""
Client-side error intake. The frontend forwards uncaught errors here so they
land in the same Sentry project as backend errors (the browser has no SDK of
its own). Unauthenticated, since errors can happen before login, but rate
limited and size capped.
"""

from __future__ import annotations

import logging

import sentry_sdk
from fastapi import APIRouter, Depends, status

from app.schemas import ClientErrorReport
from app.services.ratelimit import rate_limit

logger = logging.getLogger("slonbelka.client")

router = APIRouter(tags=["client-errors"])


@router.post(
    "/client-errors",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("client_errors", limit=30, window_seconds=60))],
)
def report_client_error(body: ClientErrorReport) -> None:
    logger.warning("client error [%s]: %s (%s)", body.kind, body.message, body.url)
    # A no-op when Sentry is not initialized, so this is safe in dev and tests.
    with sentry_sdk.push_scope() as scope:
        scope.set_tag("source", "frontend")
        scope.set_context(
            "client",
            {
                "kind": body.kind,
                "url": body.url,
                "user_agent": body.user_agent,
                "stack": body.stack,
                "component_stack": body.component_stack,
            },
        )
        sentry_sdk.capture_message(f"[frontend] {body.message}", level="error")
