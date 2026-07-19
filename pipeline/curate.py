"""
Gloss curation: turn raw Wiktionary (Kaikki) glosses into short, typeable
answers plus an optional prose description.

Raw glosses arrive as dictionary prose ('Generic demonstrative pronoun.
Translated as "this" or "that"...'). Shipping that unchanged makes it both
the displayed meaning and the grading accept-list, which asks the learner to
type a paragraph. This module splits the two roles:

- answers: short phrases a learner can actually type, used for
  translation_primary / translations (the accept-list)
- description: the original prose of the first verbose gloss, kept for
  display under the word (Item.notes), so no information is lost

A gloss that is already short passes through (split on commas/semicolons).
A verbose gloss contributes only its quoted terms ('Translated as "this" or
"that"' -> this, that) and its prose becomes the description. If nothing
typeable can be derived at all, answers is empty and the caller should drop
the record for manual review.
"""

from __future__ import annotations

import re

# Longest string we consider a reasonable thing to type as an answer.
MAX_ANSWER_LEN = 40
# Cap for the stored description; Wiktionary usage notes can run very long.
MAX_DESCRIPTION_LEN = 500

# Alphabet letters are not vocabulary; the deck drops them entirely.
LETTER_GLOSS_RE = re.compile(r"letter of the (Russian|Cyrillic) alphabet", re.IGNORECASE)

_QUOTED_RE = re.compile(r'["“‘`]([^"”’`]{1,60})["”’`]')
_PAREN_RE = re.compile(r"\([^)]*\)")


def is_letter_entry(glosses: list[str]) -> bool:
    return any(LETTER_GLOSS_RE.search(g) for g in glosses[:1])


def _strip_parens(text: str) -> str:
    return _PAREN_RE.sub("", text)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" \t,;").rstrip(".").strip()


def _is_verbose(gloss: str) -> bool:
    """Dictionary prose rather than a plain translation: long, or carries
    sentence punctuation once parentheticals are removed."""
    core = _clean(_strip_parens(gloss))
    return len(core) > MAX_ANSWER_LEN or any(ch in core for ch in ".;:")


def _quoted_terms(gloss: str) -> list[str]:
    out = []
    for term in _QUOTED_RE.findall(gloss):
        term = _clean(term)
        if term and len(term) <= MAX_ANSWER_LEN and "." not in term:
            out.append(term)
    return out


def _split_short(gloss: str) -> list[str]:
    parts = re.split(r"[,;]", _strip_parens(gloss))
    return [p for p in (_clean(p) for p in parts) if p and len(p) <= MAX_ANSWER_LEN]


def curate_glosses(glosses: list[str]) -> tuple[list[str], str | None]:
    """Returns (answers, description). answers is empty when no typeable
    answer could be derived; description is None when every gloss was already
    short enough to ship as-is."""
    answers: list[str] = []
    description: str | None = None
    for gloss in glosses:
        gloss = gloss.strip()
        if not gloss:
            continue
        if _is_verbose(gloss):
            if description is None:
                description = gloss[:MAX_DESCRIPTION_LEN]
            derived = _quoted_terms(gloss)
        else:
            derived = _split_short(gloss)
        for answer in derived:
            if answer.lower() not in {a.lower() for a in answers}:
                answers.append(answer)
    return answers, description
