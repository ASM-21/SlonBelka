"""Tests for the grading module. Run: pytest -q"""

from app.grading import Grade, grade_meaning, grade_production, normalize_ru


def test_normalize_strips_stress_and_maps_yo():
    assert normalize_ru("молоко\u0301") == "молоко"
    assert normalize_ru("ещё") == "еще"
    assert normalize_ru("  Вода\u0301 ") == "вода"


# ---- production (Russian) ----
def test_production_exact_without_stress():
    assert grade_production("вода", "вода") is Grade.CORRECT


def test_production_ignores_typed_stress():
    assert grade_production("вода\u0301", "вода") is Grade.CORRECT


def test_production_yo_equivalence():
    assert grade_production("еще", "ещё") is Grade.CORRECT
    assert grade_production("ещё", "ещё") is Grade.CORRECT


def test_production_typo_within_tolerance():
    # "собака" is 6 chars -> tolerance 1
    assert grade_production("сабака", "собака") is Grade.CORRECT


def test_production_near_miss():
    # two edits on a 6-char word -> beyond tolerance but within near band
    assert grade_production("сабаку", "собака") is Grade.NEAR_MISS


def test_production_incorrect():
    assert grade_production("кошка", "собака") is Grade.INCORRECT


def test_short_word_no_typo_allowed():
    # 3 chars -> tolerance 0
    assert grade_production("дон", "дом") is Grade.NEAR_MISS
    assert grade_production("дом", "дом") is Grade.CORRECT


# ---- meaning (English) ----
def test_meaning_accept_list():
    assert grade_meaning("hi", ["hi", "hello"]) is Grade.CORRECT
    assert grade_meaning("hello", ["hi", "hello"]) is Grade.CORRECT


def test_meaning_strips_article():
    assert grade_meaning("the house", ["house"]) is Grade.CORRECT
    assert grade_meaning("to read", ["read"]) is Grade.CORRECT


def test_meaning_typo():
    assert grade_meaning("watr", ["water"]) is Grade.CORRECT  # 5 chars, tol 1


def test_meaning_incorrect():
    assert grade_meaning("dog", ["cat"]) is Grade.INCORRECT


def test_empty_answer_incorrect():
    assert grade_meaning("", ["water"]) is Grade.INCORRECT
    assert grade_production("", "вода") is Grade.INCORRECT
