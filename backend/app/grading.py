"""
Answer grading.

Server-side so the rules live in one tested place and the client cannot be the
sole arbiter. Three outcomes per answer:

  CORRECT   - exact, or within typo tolerance. Counts.
  NEAR_MISS - close but beyond tolerance. The client asks the learner to retry;
              nothing is recorded, no penalty.
  INCORRECT - otherwise. Counts as a miss.

Russian production answers are graded stress-insensitively (the learner is not
expected to type stress marks) and treat е and ё as equivalent.
"""

from __future__ import annotations

import unicodedata
from enum import Enum

COMBINING_ACUTE = "\u0301"


class Grade(str, Enum):
    CORRECT = "correct"
    NEAR_MISS = "near_miss"
    INCORRECT = "incorrect"


def normalize_ru(text: str) -> str:
    """Lowercase, map ё to е, strip stress marks, collapse whitespace."""
    text = text.strip().lower().replace("ё", "е")
    decomposed = unicodedata.normalize("NFD", text)
    decomposed = decomposed.replace(COMBINING_ACUTE, "")
    text = unicodedata.normalize("NFC", decomposed)
    return " ".join(text.split())


def normalize_en(text: str) -> str:
    """Lowercase, trim, drop a leading article, collapse whitespace."""
    text = " ".join(text.strip().lower().split())
    for article in ("to ", "the ", "a ", "an "):
        if text.startswith(article):
            text = text[len(article):]
            break
    return text


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def _tolerance(length: int) -> int:
    """How many typos count as still-correct, scaled by answer length."""
    if length <= 3:
        return 0
    if length <= 7:
        return 1
    return 2


def _grade_against(answer: str, candidates: list[str]) -> Grade:
    if not answer:
        return Grade.INCORRECT
    if answer in candidates:
        return Grade.CORRECT
    best = min(levenshtein(answer, c) for c in candidates)
    closest_len = min(len(c) for c in candidates)
    tol = _tolerance(closest_len)
    if best <= tol:
        return Grade.CORRECT
    if best <= tol + 1:
        return Grade.NEAR_MISS
    return Grade.INCORRECT


def grade_meaning(answer: str, accept_list: list[str]) -> Grade:
    """Grade an English meaning answer against the accept-list."""
    a = normalize_en(answer)
    candidates = [normalize_en(c) for c in accept_list if c.strip()]
    if not candidates:
        return Grade.INCORRECT
    return _grade_against(a, candidates)


def grade_production(answer: str, lemma: str, alt_forms: list[str] | None = None) -> Grade:
    """Grade a Russian production answer against the lemma (stress-insensitive)."""
    a = normalize_ru(answer)
    candidates = [normalize_ru(lemma)]
    for alt in alt_forms or []:
        candidates.append(normalize_ru(alt))
    return _grade_against(a, candidates)
