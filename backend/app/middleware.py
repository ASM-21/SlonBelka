"""Request-guarding ASGI middleware."""

from __future__ import annotations

import json

from starlette.exceptions import HTTPException

from app.config import settings


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
