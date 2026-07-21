"""Gloss curation unit tests: verbose Wiktionary prose becomes short answers
plus a description, short glosses pass through, letters are detected."""

from __future__ import annotations

from curate import curate_glosses, is_letter_entry

ETO_GLOSSES = [
    'Generic demonstrative pronoun. Translated as "this" or "that" (or their '
    'plural forms, "these" or "those"), depending on the context.',
    'Used as a personal pronoun when not referring to a particular noun. '
    'Translated as "it".',
    'Optionally used after a noun to introduce its definition or explanation. '
    'In the most formal texts, separated from the noun by an em dash. Often '
    'omitted, though usually not when the dash is also omitted, to avoid '
    'introducing ambiguity.',
]

LETTER_GLOSS = (
    "The nineteenth letter of the Russian alphabet, called эс (es) and "
    "written in the Cyrillic script."
)


def test_short_glosses_pass_through():
    answers, description = curate_glosses(["yes", "hello, hi"])
    assert answers == ["yes", "hello", "hi"]
    assert description is None


def test_parentheticals_are_stripped_from_short_glosses():
    answers, _ = curate_glosses(["bread (food)"])
    assert answers == ["bread"]


def test_verbose_gloss_yields_quoted_answers_and_description():
    answers, description = curate_glosses(ETO_GLOSSES)
    assert answers[:4] == ["this", "that", "these", "those"]
    assert "it" in answers
    # The prose is preserved as a description, taken from the first verbose gloss.
    assert description is not None
    assert description.startswith("Generic demonstrative pronoun.")


def test_verbose_gloss_without_quotes_contributes_nothing():
    answers, description = curate_glosses([LETTER_GLOSS.replace('"', "")])
    # эс (es) sits in parens/quotes in the real gloss; with no quoted terms
    # there is nothing typeable, so the caller must drop the record.
    assert answers == []
    assert description is not None


def test_answers_are_deduplicated_case_insensitively():
    answers, _ = curate_glosses(["Bread", 'A staple food. Also translated as "bread".'])
    assert answers == ["Bread"]


def test_letter_entries_are_detected():
    assert is_letter_entry([LETTER_GLOSS]) is True
    assert is_letter_entry(["bread"]) is False


def test_long_description_is_capped():
    long_gloss = "Word. " + "x" * 1000
    _, description = curate_glosses([long_gloss])
    assert description is not None and len(description) <= 500
