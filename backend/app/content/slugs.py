"""Stable identity for vocabulary items.

An item's identity is its external_id, not its database row id. Content imports
upsert on external_id so that regenerating or extending the deck never breaks
user progress, which references items by row id.
"""

from __future__ import annotations


def default_external_id(lemma: str, part_of_speech: str | None = None, sense: int = 0) -> str:
    """
    Deterministic stable key from lemma + part of speech + sense index.

    The content pipeline should usually set external_id explicitly (so it can
    split homographs into separate senses); this default covers the common
    one-item-per-lemma case. Cyrillic is kept as-is; the key is an internal
    identifier, not a URL.
    """
    pos = (part_of_speech or "x").strip().lower() or "x"
    base = "-".join(lemma.strip().lower().split())
    return f"{pos}:{base}:{sense}"
