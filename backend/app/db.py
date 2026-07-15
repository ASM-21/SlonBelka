"""Database engine, session, and base class."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

# pool_pre_ping tests a pooled connection with a lightweight query before use
# and transparently reconnects a dead one. Managed Postgres (Neon) closes idle
# connections, which otherwise surface as intermittent "SSL connection has been
# closed unexpectedly" errors on the first query. pool_recycle retires
# connections before that idle timeout so it rarely comes up. Both are no-ops
# worth keeping off the sqlite dev/test engine.
_engine_kwargs: dict = {"connect_args": _connect_args, "future": True}
if not _is_sqlite:
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_recycle"] = 300

engine = create_engine(settings.database_url, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
