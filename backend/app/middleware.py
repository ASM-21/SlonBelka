"""Request-guarding and observability ASGI middleware."""

from __future__ import annotations

import json
import logging
import time

from starlette.exceptions import HTTPException

from app.config import settings
from app.services.metrics import registry as metrics

logger = logging.getLogger("slonbelka.request")

# Probe endpoints are hit constantly by orchestrators; keeping them out of
# the logs and the metrics stops them drowning out real traffic.
PROBE_PATHS = {"/health", "/health/ready"}


class BodySizeLimitMiddleware:
    """Reject request bodies larger than settings.max_body_bytes with a 413.

    The Content-Length header is checked before the app runs. Bodies that
    arrive without a Content-Length (chunked transfer) are counted as they
    stream and cut off at the same cap. Written as pure ASGI middleware so
    responses are never buffered.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = settings.max_body_bytes
        for name, value in scope.get("headers") or []:
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = None
                if declared is not None and declared > limit:
                    await _send_too_large(send)
                    return
                break

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Raised while a route reads the body. FastAPI re-raises
                    # HTTPException, so this surfaces as a 413, not a 500.
                    raise HTTPException(413, "Request body too large")
            return message

        await self.app(scope, limited_receive, send)


class RequestLogMiddleware:
    """One structured log line per request: method, path, status, duration,
    client IP. Key=value format so a log platform can parse without config.
    Each request is also counted into the in-process metrics registry.
    Probe paths are skipped to keep liveness checks out of both."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope.get("path") in PROBE_PATHS:
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        seen: dict = {}

        async def logging_send(message) -> None:
            if message["type"] == "http.response.start":
                seen["status"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, logging_send)
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            metrics.record(seen.get("status"), duration_ms)
            client = scope.get("client")
            logger.info(
                "method=%s path=%s status=%s duration_ms=%.1f client=%s",
                scope.get("method"),
                scope.get("path"),
                seen.get("status", "unfinished"),
                duration_ms,
                client[0] if client else "-",
            )


async def _send_too_large(send) -> None:
    body = json.dumps({"detail": "Request body too large"}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
