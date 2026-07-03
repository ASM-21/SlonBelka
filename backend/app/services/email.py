"""
Email delivery.

A stub that logs and records into an in-memory outbox so dev and tests can see
what would be sent. Swap _deliver for a real provider (SES, Resend, SMTP) in
production. The raw token is included on the outbox record for test convenience
only; a real provider would only ever put it inside a link in the body.
"""

from __future__ import annotations

from app.config import settings

_outbox: list[dict] = []


def _deliver(to: str, subject: str, body: str, token: str | None) -> None:
    _outbox.append({"to": to, "subject": subject, "body": body, "token": token})
    print(f"[email] to={to} subject={subject!r}")


def get_outbox() -> list[dict]:
    return _outbox


def clear_outbox() -> None:
    _outbox.clear()


def send_verification_email(to: str, token: str) -> None:
    link = f"{settings.frontend_origin}/verify-email?token={token}"
    _deliver(to, "Verify your Slonbelka email", f"Confirm your email: {link}", token)


def send_password_reset_email(to: str, token: str) -> None:
    link = f"{settings.frontend_origin}/reset-password?token={token}"
    _deliver(to, "Reset your Slonbelka password", f"Reset your password: {link}", token)
