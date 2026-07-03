"""
Development seed: a handful of real Russian words with correct stress marks,
so the lessons and reviews endpoints are demonstrable before the full content
pipeline exists. Idempotent. Run: python -m app.seed_dev

Audio is left null here; it is generated at build time by the content pipeline
(native Wiktionary audio with TTS fallback). Stress uses the combining acute
U+0301 after the stressed vowel.
"""

from __future__ import annotations

from app.content.importer import upsert_items
from app.db import Base, SessionLocal, engine

# (lemma, stressed_form, translations, pos, gender, level)
WORDS = [
    ("да", "да", ["yes"], "particle", None, 1),
    ("нет", "нет", ["no"], "particle", None, 1),
    ("привет", "приве\u0301т", ["hi", "hello"], "interjection", None, 1),
    ("спасибо", "спаси\u0301бо", ["thank you", "thanks"], "interjection", None, 1),
    ("дом", "дом", ["house", "home"], "noun", "m", 1),
    ("вода", "вода\u0301", ["water"], "noun", "f", 1),
    ("хлеб", "хлеб", ["bread"], "noun", "m", 1),
    ("кот", "кот", ["cat", "tomcat"], "noun", "m", 1),
    ("мама", "ма\u0301ма", ["mom", "mum", "mother"], "noun", "f", 2),
    ("книга", "кни\u0301га", ["book"], "noun", "f", 2),
    ("собака", "соба\u0301ка", ["dog"], "noun", "f", 2),
    ("молоко", "молоко\u0301", ["milk"], "noun", "n", 2),
    ("город", "го\u0301род", ["city", "town"], "noun", "m", 2),
    ("друг", "друг", ["friend"], "noun", "m", 2),
]


def seed() -> int:
    """Idempotent: upserts the demo words on external_id. Returns rows created."""
    Base.metadata.create_all(bind=engine)
    records = [
        {
            "type": "vocab",
            "level": level,
            "lemma": lemma,
            "stressed_form": stressed,
            "translation_primary": trans[0],
            "translations": trans,
            "part_of_speech": pos,
            "gender": gender,
            "frequency_rank": rank,
        }
        for rank, (lemma, stressed, trans, pos, gender, level) in enumerate(WORDS, start=1)
    ]
    with SessionLocal() as db:
        result = upsert_items(db, records)
    return result["created"]


if __name__ == "__main__":
    n = seed()
    print(f"Seeded {n} new items.")
