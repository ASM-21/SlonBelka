"""Tests for the pure SRS engine. Run: pytest -q"""

from datetime import datetime, timezone

import pytest

from app.srs import engine as e


# --------------------------------------------------------------------------- #
# Correct answers advance one stage and cap at Burned
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("stage,expected", [(1, 2), (4, 5), (5, 6), (7, 8), (8, 9)])
def test_correct_advances_one_stage(stage, expected):
    assert e.apply_review(stage, incorrect_answers=0, level=10) == expected


def test_correct_caps_at_burned():
    assert e.apply_review(e.BURNED, 0, level=10) == e.BURNED


# --------------------------------------------------------------------------- #
# Penalty formula: round_half_up(incorrect/2) * penalty_factor, floored at 1
# --------------------------------------------------------------------------- #
def test_apprentice_single_miss_drops_one():
    # stage 4, 1 wrong: factor 1, adj 1 -> 3
    assert e.apply_review(4, incorrect_answers=1, level=10) == 3


def test_guru_single_miss_drops_two():
    # stage 5, 1 wrong: factor 2, adj 1 -> 3
    assert e.apply_review(5, incorrect_answers=1, level=10) == 3


def test_two_misses_same_adjustment_as_one():
    # round_half_up(2/2)=1, same adjustment as a single miss
    assert e.apply_review(5, incorrect_answers=2, level=10) == 3
    assert e.apply_review(3, incorrect_answers=2, level=10) == 2


def test_three_misses_round_up():
    # round_half_up(3/2)=2, apprentice factor 1 -> stage 2 - 2 = floored to 1
    assert e.apply_review(2, incorrect_answers=3, level=10) == 1


def test_floor_at_apprentice_one():
    assert e.apply_review(1, incorrect_answers=2, level=10) == 1
    assert e.apply_review(5, incorrect_answers=4, level=10) == 1


def test_penalty_factor_switch():
    assert e.penalty_factor(4) == 1
    assert e.penalty_factor(5) == 2


# --------------------------------------------------------------------------- #
# Intervals and acceleration
# --------------------------------------------------------------------------- #
def test_standard_intervals():
    assert e.interval_for(1, level=10) == e.STANDARD_INTERVALS[1]
    assert e.interval_for(4, level=10) == 2 * e.DAY


def test_early_levels_are_accelerated_through_apprentice():
    assert e.interval_for(1, level=1) == 2 * e.HOUR
    assert e.interval_for(3, level=3) == 8 * e.HOUR
    # stages 5+ are not accelerated
    assert e.interval_for(5, level=1) == e.STANDARD_INTERVALS[5]


def test_level_four_is_not_accelerated():
    assert e.interval_for(1, level=4) == e.STANDARD_INTERVALS[1]


def test_burned_has_no_interval():
    assert e.interval_for(e.BURNED, level=10) is None


def test_schedule_floors_to_hour():
    now = datetime(2026, 6, 21, 14, 37, 12, tzinfo=timezone.utc)
    due = e.next_available_at(stage=1, level=10, now=now)
    assert due == datetime(2026, 6, 21, 18, 0, 0, tzinfo=timezone.utc)


def test_schedule_burned_is_none():
    assert e.next_available_at(e.BURNED, level=10) is None


# --------------------------------------------------------------------------- #
# Guru and gating
# --------------------------------------------------------------------------- #
def test_is_guru():
    assert not e.is_guru(4)
    assert e.is_guru(5)
    assert e.is_guru(9)


def test_unlock_thresholds_by_band():
    assert e.unlock_threshold(1) == 0.70
    assert e.unlock_threshold(3) == 0.70
    assert e.unlock_threshold(4) == 0.80
    assert e.unlock_threshold(5) == 0.80
    assert e.unlock_threshold(6) == 0.90
    assert e.unlock_threshold(50) == 0.90


def test_level_cleared_boundaries_early():
    # level 1 needs 70%
    assert e.level_is_cleared(7, 10, level=1) is True
    assert e.level_is_cleared(6, 10, level=1) is False


def test_level_cleared_boundaries_standard():
    # level 6 needs 90%
    assert e.level_is_cleared(9, 10, level=6) is True
    assert e.level_is_cleared(8, 10, level=6) is False


def test_level_cleared_empty_level():
    assert e.level_is_cleared(0, 0, level=1) is False


# --------------------------------------------------------------------------- #
# Leeches
# --------------------------------------------------------------------------- #
def test_leech_score_decreases_with_streak():
    assert e.leech_score(5, 1) > e.leech_score(5, 4)


def test_is_leech_by_score():
    assert e.is_leech(incorrect_count=4, correct_streak=1, guru_to_apprentice_demotions=0)
    assert not e.is_leech(incorrect_count=1, correct_streak=5, guru_to_apprentice_demotions=0)


def test_is_leech_by_demotions():
    assert e.is_leech(incorrect_count=0, correct_streak=10, guru_to_apprentice_demotions=2)


# --------------------------------------------------------------------------- #
# review() result object and milestones
# --------------------------------------------------------------------------- #
def test_review_marks_first_pass():
    r = e.review(stage=4, incorrect_answers=0, level=10, already_passed=False)
    assert r.new_stage == 5
    assert r.passed is True
    assert r.burned is False
    assert r.available_at is not None


def test_review_does_not_remark_passed():
    r = e.review(stage=5, incorrect_answers=0, level=10, already_passed=True)
    assert r.new_stage == 6
    assert r.passed is False


def test_review_burn():
    r = e.review(stage=8, incorrect_answers=0, level=10, already_passed=True)
    assert r.new_stage == e.BURNED
    assert r.burned is True
    assert r.available_at is None


# --------------------------------------------------------------------------- #
# Invariants (lightweight property checks)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("stage", range(1, 10))
@pytest.mark.parametrize("incorrect", [0, 1, 2, 3, 4])
def test_stage_stays_in_bounds(stage, incorrect):
    out = e.apply_review(stage, incorrect, level=10)
    assert e.MIN_STAGE <= out <= e.MAX_STAGE


@pytest.mark.parametrize("stage", range(1, 9))
def test_correct_never_lowers_stage(stage):
    assert e.apply_review(stage, 0, level=10) >= stage
