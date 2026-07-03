"""
Slonbelka SRS engine.

Pure functions only, no database or clock dependencies, so the correctness-
critical logic can be unit and property tested in isolation. The API layer
wraps these functions and handles persistence.

Modeled on WaniKani: nine stages across five groups, Guru reached at stage 5.
Early-level acceleration (levels 1 to 3) shortens the Apprentice intervals.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# --------------------------------------------------------------------------- #
# Stages
# --------------------------------------------------------------------------- #
APPRENTICE_1 = 1
APPRENTICE_2 = 2
APPRENTICE_3 = 3
APPRENTICE_4 = 4
GURU_1 = 5
GURU_2 = 6
MASTER = 7
ENLIGHTENED = 8
BURNED = 9

MIN_STAGE = APPRENTICE_1
MAX_STAGE = BURNED
GURU_THRESHOLD = GURU_1  # stage at which an item counts as "learned"

STAGE_NAMES = {
    1: "Apprentice 1",
    2: "Apprentice 2",
    3: "Apprentice 3",
    4: "Apprentice 4",
    5: "Guru 1",
    6: "Guru 2",
    7: "Master",
    8: "Enlightened",
    9: "Burned",
}

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
WEEK = timedelta(weeks=1)

# Interval to wait WHILE AT a given stage, before the next review.
# Stage 9 (Burned) has no further reviews.
STANDARD_INTERVALS: dict[int, timedelta] = {
    1: 4 * HOUR,
    2: 8 * HOUR,
    3: 1 * DAY,
    4: 2 * DAY,
    5: 1 * WEEK,
    6: 2 * WEEK,
    7: 30 * DAY,    # ~1 month
    8: 120 * DAY,   # ~4 months
}

# WaniKani accelerates only levels 1 to 2. Slonbelka extends this through level 3
# to open the early game sooner. Stages 5+ are unchanged.
ACCELERATED_INTERVALS: dict[int, timedelta] = {
    1: 2 * HOUR,
    2: 4 * HOUR,
    3: 8 * HOUR,
    4: 1 * DAY,
}

ACCELERATED_MAX_LEVEL = 3


# --------------------------------------------------------------------------- #
# Intervals and scheduling
# --------------------------------------------------------------------------- #
def interval_for(stage: int, level: int) -> timedelta | None:
    """
    Wait time while at `stage` for an item in `level`. Returns None for Burned
    (no further reviews).
    """
    if stage >= BURNED:
        return None
    if level <= ACCELERATED_MAX_LEVEL and stage in ACCELERATED_INTERVALS:
        return ACCELERATED_INTERVALS[stage]
    return STANDARD_INTERVALS[stage]


def _floor_to_hour(dt: datetime) -> datetime:
    """Round down to the top of the hour (matches WaniKani, avoids trickle)."""
    return dt.replace(minute=0, second=0, microsecond=0)


def next_available_at(stage: int, level: int, now: datetime | None = None) -> datetime | None:
    """
    Datetime the item next becomes due, or None if Burned.
    `now` defaults to the current UTC time.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    delta = interval_for(stage, level)
    if delta is None:
        return None
    return _floor_to_hour(now + delta)


# --------------------------------------------------------------------------- #
# Stage transitions
# --------------------------------------------------------------------------- #
def _round_half_up(value: float) -> int:
    """Round half up (Python's built-in round uses banker's rounding)."""
    return math.floor(value + 0.5)


def penalty_factor(stage: int) -> int:
    """1 while Apprentice, 2 once Guru or above (misses hurt more later)."""
    return 1 if stage <= APPRENTICE_4 else 2


def apply_review(stage: int, incorrect_answers: int, level: int) -> int:
    """
    New SRS stage after a review pass for one item.

    incorrect_answers is the number of wrong answers for the item across its
    question types in this pass (0, 1, or 2 in v1).

    Correct  -> advance one stage (capped at Burned).
    Incorrect-> drop by round_half_up(incorrect / 2) * penalty_factor, floored
                at Apprentice 1. Matches the WaniKani decrement formula.
    """
    if incorrect_answers <= 0:
        return min(MAX_STAGE, stage + 1)
    adjustment = _round_half_up(incorrect_answers / 2)
    new_stage = stage - adjustment * penalty_factor(stage)
    return max(MIN_STAGE, new_stage)


def is_guru(stage: int) -> bool:
    return stage >= GURU_THRESHOLD


def is_burned(stage: int) -> bool:
    return stage >= BURNED


def band(stage: int) -> str:
    """Human-facing SRS band for a stage (apprentice/guru/master/enlightened/burned)."""
    if stage <= APPRENTICE_4:
        return "apprentice"
    if stage <= GURU_2:
        return "guru"
    if stage == MASTER:
        return "master"
    if stage == ENLIGHTENED:
        return "enlightened"
    return "burned"


# --------------------------------------------------------------------------- #
# Level gating
# --------------------------------------------------------------------------- #
def unlock_threshold(level: int) -> float:
    """
    Fraction of a level's items that must reach Guru before the next level
    unlocks. Loosened for the first few levels, then standard.
    """
    if level <= 3:
        return 0.70
    if level <= 5:
        return 0.80
    return 0.90


def level_is_cleared(guru_count: int, total_count: int, level: int) -> bool:
    """True when the Guru fraction of the level meets its unlock threshold."""
    if total_count <= 0:
        return False
    return (guru_count / total_count) >= unlock_threshold(level)


# --------------------------------------------------------------------------- #
# Leeches
# --------------------------------------------------------------------------- #
LEECH_SCORE_THRESHOLD = 1.0
LEECH_DEMOTION_THRESHOLD = 2  # Guru-or-above -> Apprentice falls

def leech_score(incorrect_count: int, correct_streak: int) -> float:
    """
    Community-style leech metric: high when an item is missed often relative to
    its current correct streak.
    """
    return incorrect_count / (max(1, correct_streak) ** 1.5)


def is_leech(incorrect_count: int, correct_streak: int, guru_to_apprentice_demotions: int) -> bool:
    """An item is a leech if it scores high OR keeps falling back from Guru."""
    if guru_to_apprentice_demotions >= LEECH_DEMOTION_THRESHOLD:
        return True
    return leech_score(incorrect_count, correct_streak) >= LEECH_SCORE_THRESHOLD


# --------------------------------------------------------------------------- #
# Convenience result object
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ReviewResult:
    new_stage: int
    available_at: datetime | None
    passed: bool   # reached Guru for the first time this pass
    burned: bool   # reached Burned this pass


def review(
    stage: int,
    incorrect_answers: int,
    level: int,
    now: datetime | None = None,
    already_passed: bool = False,
) -> ReviewResult:
    """
    Apply one review pass and return the new stage, schedule, and milestone flags.
    `already_passed` indicates the item had previously reached Guru.
    """
    new_stage = apply_review(stage, incorrect_answers, level)
    return ReviewResult(
        new_stage=new_stage,
        available_at=next_available_at(new_stage, level, now),
        passed=is_guru(new_stage) and not already_passed,
        burned=is_burned(new_stage),
    )
