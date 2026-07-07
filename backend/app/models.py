"""
SQLAlchemy models, implementing section 17 of the design doc.

Integer primary keys for scaffold simplicity (the doc keeps ids generic).
JSON columns work on both sqlite and Postgres. Indexes added on the hot paths.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.timeutil import utcnow as _utcnow
from app.db import Base



class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    current_level: Mapped[int] = mapped_column(Integer, default=1)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    # NULL for accounts created before the terms checkbox existed.
    tos_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stable identity for content upserts. User progress references items by row
    # id, so content must upsert on external_id and never truncate-and-reinsert.
    external_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(16), default="vocab")  # vocab | kana
    level: Mapped[int] = mapped_column(Integer, index=True)
    lemma: Mapped[str] = mapped_column(String(128), index=True)
    stressed_form: Mapped[str] = mapped_column(String(128))
    translation_primary: Mapped[str] = mapped_column(String(255))
    translations: Mapped[list] = mapped_column(JSON, default=list)  # accept-list
    part_of_speech: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True)
    aspect: Mapped[str | None] = mapped_column(String(16), nullable=True)
    aspect_pair_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    ipa: Mapped[str | None] = mapped_column(String(128), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    frequency_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    sentences: Mapped[list["ExampleSentence"]] = relationship(back_populates="item")


class ExampleSentence(Base):
    __tablename__ = "example_sentences"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    ru_text: Mapped[str] = mapped_column(Text)
    en_text: Mapped[str] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    license: Mapped[str | None] = mapped_column(String(64), nullable=True)

    item: Mapped["Item"] = relationship(back_populates="sentences")


class Mnemonic(Base):
    __tablename__ = "mnemonics"
    __table_args__ = (UniqueConstraint("item_id", "user_id", name="uq_mnemonic_item_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    meaning_mnemonic: Mapped[str | None] = mapped_column(Text, nullable=True)
    reading_mnemonic: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserItemState(Base):
    """Fast-read projection of the review_events log."""

    __tablename__ = "user_item_state"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", name="uq_state_user_item"),
        Index("ix_state_user_available", "user_id", "available_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    srs_stage: Mapped[int] = mapped_column(Integer, default=1)
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    passed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    burned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_streak: Mapped[int] = mapped_column(Integer, default=0)
    guru_to_apprentice_demotions: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    leech_score: Mapped[float] = mapped_column(Float, default=0.0)
    is_leech: Mapped[bool] = mapped_column(Boolean, default=False)


class ReviewEvent(Base):
    """Append-only log. Idempotent on client_event_id for offline sync."""

    __tablename__ = "review_events"
    __table_args__ = (
        UniqueConstraint("user_id", "client_event_id", name="uq_review_client_id"),
        Index("ix_review_user_answered", "user_id", "answered_at"),
        Index("ix_review_user_item", "user_id", "item_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    question_type: Mapped[str] = mapped_column(String(16))  # meaning | production
    client_event_id: Mapped[str] = mapped_column(String(64))
    correct: Mapped[bool] = mapped_column(Boolean)
    was_override: Mapped[bool] = mapped_column(Boolean, default=False)
    srs_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    srs_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class LessonEvent(Base):
    __tablename__ = "lesson_events"
    __table_args__ = (Index("ix_lesson_user_learned", "user_id", "learned_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    learned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(Text)
    keys: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AudioAsset(Base):
    """Tracks audio files and their license/attribution (native or TTS)."""

    __tablename__ = "audio_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    url: Mapped[str] = mapped_column(String(512))
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)  # wiktionary | tts
    license: Mapped[str | None] = mapped_column(String(64), nullable=True)
    attribution: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuthToken(Base):
    """
    Refresh, email-verification, and password-reset tokens. Only the SHA-256
    hash of the raw token is stored. Refresh tokens are revoked on rotation;
    verification and reset tokens are single-use (revoked on use).
    """

    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(16), index=True)  # refresh | email_verify | password_reset
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Subscription(Base):
    """One row per user. Mirrors Stripe state; entitlement is derived from status."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="none")  # none|trialing|active|past_due|canceled
    plan: Mapped[str | None] = mapped_column(String(16), nullable=True)  # monthly|yearly|lifetime
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class UserSynonym(Base):
    """A user-defined accepted meaning for an item (added during study)."""

    __tablename__ = "user_synonyms"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", "text", name="uq_synonym_user_item_text"),
        Index("ix_synonym_user_item", "user_id", "item_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    text: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
