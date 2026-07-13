"""Pydantic schemas for the API surface."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---- auth ----
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    accepted_terms: bool = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=256)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(max_length=256)


class VerifyEmailRequest(BaseModel):
    token: str = Field(max_length=256)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    current_level: int
    email_verified: bool

    model_config = {"from_attributes": True}


# ---- lessons ----
class LessonItem(BaseModel):
    id: int
    type: str
    level: int
    lemma: str
    stressed_form: str
    translation_primary: str
    translations: list[str] = []
    part_of_speech: str | None = None
    gender: str | None = None
    aspect: str | None = None
    audio_url: str | None = None

    model_config = {"from_attributes": True}


class CompleteLessonsRequest(BaseModel):
    item_ids: list[int]


# ---- reviews ----
class ReviewItem(BaseModel):
    item_id: int
    question_type: str           # meaning | production
    prompt: str                  # Russian (meaning) or English (production)
    audio_url: str | None = None
    part_of_speech: str | None = None


class SubmitReviewRequest(BaseModel):
    item_id: int
    question_type: str
    answer: str = Field(default="", max_length=256)
    client_event_id: str = Field(min_length=1, max_length=64)  # matches the column width
    answered_at: datetime | None = None
    override: bool = False


class SubmitReviewResponse(BaseModel):
    status: str                  # correct | incorrect | near_miss | override | duplicate
    correct: bool
    srs_stage: int
    srs_stage_before: int        # stage when the answer was submitted; differs from
    srs_stage_name: str          # srs_stage only when this answer completed a pass
    srs_stage_before_name: str
    available_at: datetime | None = None
    pass_complete: bool = False
    passed: bool = False
    burned: bool = False
    expected: str                # answer to show in feedback
    stressed_form: str           # always shown so the learner sees correct stress
    leveled_up: bool = False
    current_level: int | None = None


class ForecastResponse(BaseModel):
    due_now: int
    frozen: bool = False
    hourly: list[int]  # 24 rolling one-hour buckets from now
    daily: list[int]   # 7 rolling one-day buckets from now


class LevelProgress(BaseModel):
    level: int
    guru: int
    total: int
    threshold: float
    fraction: float
    cleared: bool


class SrsCounts(BaseModel):
    apprentice: int
    guru: int
    master: int
    enlightened: int
    burned: int


class DashboardResponse(BaseModel):
    current_level: int
    frozen: bool = False
    level_progress: LevelProgress
    srs_counts: SrsCounts
    lessons_available: int
    reviews_due: int
    reviews_upcoming_24h: int
    streak: int
    accuracy: float | None = None
    total_reviews: int
    leech_count: int


# ---- leeches, practice, mnemonics ----
class LeechItem(BaseModel):
    item_id: int
    stressed_form: str
    translation_primary: str
    srs_stage: int
    stage_name: str
    accuracy: float | None = None
    incorrect_count: int
    leech_score: float
    last_reviewed_at: datetime | None = None


class PracticeRequest(BaseModel):
    item_id: int
    question_type: str
    answer: str = Field(default="", max_length=256)


class PracticeResult(BaseModel):
    correct: bool
    status: str
    expected: str
    stressed_form: str


class MnemonicRequest(BaseModel):
    meaning_mnemonic: str | None = Field(default=None, max_length=2000)
    reading_mnemonic: str | None = Field(default=None, max_length=2000)


class MnemonicResponse(BaseModel):
    item_id: int
    meaning_mnemonic: str | None = None
    reading_mnemonic: str | None = None


# ---- billing ----
class CheckoutRequest(BaseModel):
    plan: str  # monthly | yearly | lifetime


class UrlResponse(BaseModel):
    url: str


class BillingStatus(BaseModel):
    is_premium: bool
    status: str
    plan: str | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    free_level_limit: int
    current_level: int
    accessible_level: int


# ---- sync, settings, vacation ----
class SyncRequest(BaseModel):
    events: list[SubmitReviewRequest]


class SyncResultItem(BaseModel):
    client_event_id: str
    status: str
    srs_stage: int | None = None
    error: str | None = None


class SyncResponse(BaseModel):
    results: list[SyncResultItem]


class SettingsResponse(BaseModel):
    daily_lesson_cap: int
    autoplay_audio: bool
    keyboard_layout: str
    onboarded: bool = False
    reminders_enabled: bool = True
    quiet_hours_enabled: bool = False
    quiet_hours_start: int = 22
    quiet_hours_end: int = 7
    frozen: bool = False


class SettingsPatch(BaseModel):
    daily_lesson_cap: int | None = None
    autoplay_audio: bool | None = None
    keyboard_layout: str | None = None
    onboarded: bool | None = None
    reminders_enabled: bool | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: int | None = Field(default=None, ge=0, le=23)
    quiet_hours_end: int | None = Field(default=None, ge=0, le=23)


class VacationRequest(BaseModel):
    on: bool


class AccountDeleteRequest(BaseModel):
    password: str = Field(max_length=128)


class ClientErrorReport(BaseModel):
    message: str = Field(max_length=2000)
    stack: str | None = Field(default=None, max_length=4000)
    kind: str | None = Field(default=None, max_length=32)
    component_stack: str | None = Field(default=None, max_length=4000)
    url: str | None = Field(default=None, max_length=1024)
    user_agent: str | None = Field(default=None, max_length=512)


class VacationResponse(BaseModel):
    frozen: bool


# ---- item browser ----
class ItemSummary(BaseModel):
    id: int
    lemma: str
    stressed_form: str
    translation_primary: str
    part_of_speech: str | None = None
    level: int
    frequency_rank: int | None = None
    status: str  # locked | available | apprentice | guru | master | enlightened | burned
    srs_stage: int | None = None
    available_at: datetime | None = None
    is_leech: bool = False
    accessible: bool


class ItemBrowseResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[ItemSummary]


class LevelSummary(BaseModel):
    level: int
    total: int
    guru: int
    threshold: float
    cleared: bool
    accessible: bool
    current: bool


class SentenceOut(BaseModel):
    ru: str
    en: str
    audio_url: str | None = None


class MnemonicOut(BaseModel):
    meaning: str | None = None
    reading: str | None = None


class ItemStateOut(BaseModel):
    srs_stage: int
    srs_band: str
    available_at: datetime | None = None
    last_reviewed_at: datetime | None = None
    correct_count: int
    incorrect_count: int
    correct_streak: int
    is_leech: bool
    leech_score: float
    unlocked_at: datetime | None = None
    passed_at: datetime | None = None
    burned_at: datetime | None = None


class AudioAttribution(BaseModel):
    source: str | None = None  # wiktionary | tts
    license: str | None = None
    attribution: str | None = None


class ItemDetail(ItemSummary):
    translations: list[str] = []
    synonyms: list[str] = []
    gender: str | None = None
    aspect: str | None = None
    ipa: str | None = None
    audio_url: str | None = None
    audio_attribution: AudioAttribution | None = None
    notes: str | None = None
    sentences: list[SentenceOut] = []
    mnemonic: MnemonicOut | None = None
    state: ItemStateOut | None = None


class SynonymRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100)


class SynonymsResponse(BaseModel):
    synonyms: list[str]



# ---- push notifications ----
class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(max_length=1024)
    keys: dict  # { p256dh, auth }


# ---- burned / resurrection ----
class BurnedItem(BaseModel):
    item_id: int
    stressed_form: str
    translation_primary: str
    level: int
    burned_at: datetime | None = None


class ResurrectResponse(BaseModel):
    item_id: int
    srs_stage: int
    available_at: datetime | None = None


# ---- stats ----
class StatsDay(BaseModel):
    date: str
    count: int
    correct: int


class StatsTotals(BaseModel):
    total_reviews: int
    accuracy: float | None = None
    current_streak: int
    longest_streak: int
    items_started: int
    items_burned: int


class StatsResponse(BaseModel):
    totals: StatsTotals
    reviews_by_day: list[StatsDay]
    srs_distribution: dict[str, int]
