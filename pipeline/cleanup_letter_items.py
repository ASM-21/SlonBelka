"""
One-off cleanup: remove alphabet-letter items from the deck.

Letters are not vocabulary (decision recorded in pipeline/curate.py, which
also stops the pipeline from producing them). This removes existing letter
rows, identified by the Wiktionary boilerplate gloss in their translations,
together with their dependent rows (SRS state, review history, mnemonics,
synonyms, sentences) - removing the item removes any progress on it.

Dry-run by default.

Usage:
    python cleanup_letter_items.py             # report only, deletes nothing
    python cleanup_letter_items.py --execute   # actually delete
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from sqlalchemy import delete, select  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ExampleSentence, Item, LessonEvent, Mnemonic, ReviewEvent, UserItemState, UserSynonym,
)

from curate import LETTER_GLOSS_RE  # noqa: E402

# Everything that FKs items.id; deleted before the item itself.
DEPENDENT_MODELS = [
    ExampleSentence, Mnemonic, UserItemState, ReviewEvent, LessonEvent, UserSynonym,
]


def is_letter_item(item: Item) -> bool:
    texts = [item.translation_primary] + list(item.translations or [])
    return any(isinstance(t, str) and LETTER_GLOSS_RE.search(t) for t in texts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true", help="actually delete; default is dry-run")
    args = ap.parse_args()

    with SessionLocal() as db:
        letters = [item for item in db.scalars(select(Item)) if is_letter_item(item)]
        if not letters:
            print("No alphabet-letter items found. Nothing to do.")
            return

        print(f"{len(letters)} alphabet-letter item(s):")
        for item in letters:
            print(f"  {item.external_id}  {item.lemma}  (level {item.level})")

        if not args.execute:
            print("\nDry run only. Rerun with --execute to delete them and their user progress.")
            return

        ids = [item.id for item in letters]
        for model in DEPENDENT_MODELS:
            db.execute(delete(model).where(model.item_id.in_(ids)))
        for item in letters:
            db.delete(item)
        db.commit()
        print(f"\nDeleted {len(letters)} items and their dependent rows.")


if __name__ == "__main__":
    main()
