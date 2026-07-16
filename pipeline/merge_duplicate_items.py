"""
One-off cleanup: for words that exist twice (old seed_dev.py demo row without
audio + real pipeline row with audio, under different part_of_speech tags),
move any review/SRS/mnemonic history from the orphan row onto the row that
has audio, then delete the orphan. Keeps history, removes the duplicate.

Dry-run by default.

Usage:
    python merge_duplicate_items.py                # report only
    python merge_duplicate_items.py --execute       # actually merge + delete
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from sqlalchemy import select, func  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ExampleSentence, Item, LessonEvent, Mnemonic, ReviewEvent, UserItemState,
)

DEPENDENT_MODELS = [ExampleSentence, Mnemonic, UserItemState, ReviewEvent, LessonEvent]


def find_duplicate_pairs(db) -> list[tuple[Item, Item]]:
    lemma_counts = db.execute(
        select(Item.lemma, func.count(Item.id)).group_by(Item.lemma).having(func.count(Item.id) > 1)
    ).all()
    pairs = []
    for lemma, _ in lemma_counts:
        rows = db.scalars(select(Item).where(Item.lemma == lemma)).all()
        with_audio = [r for r in rows if r.audio_url]
        without_audio = [r for r in rows if not r.audio_url]
        if len(with_audio) == 1 and without_audio:
            for orphan in without_audio:
                pairs.append((orphan, with_audio[0]))
    return pairs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    args = ap.parse_args()

    with SessionLocal() as db:
        pairs = find_duplicate_pairs(db)
        if not pairs:
            print("No duplicate word pairs found.")
            return

        print(f"{len(pairs)} duplicate pair(s):")
        for orphan, survivor in pairs:
            print(f"  {orphan.lemma}: {orphan.external_id} (no audio) -> {survivor.external_id} (has audio)")

        if not args.execute:
            print("\nDry run only. Rerun with --execute to merge + delete.")
            return

        for orphan, survivor in pairs:
            for model in DEPENDENT_MODELS:
                rows = db.scalars(select(model).where(model.item_id == orphan.id)).all()
                for row in rows:
                    try:
                        with db.begin_nested():
                            row.item_id = survivor.id
                            db.flush()
                    except IntegrityError:
                        # survivor already has a row for the same user/model
                        # (e.g. duplicate UserItemState) -> can't merge, drop
                        # the orphan's copy instead of erroring the whole run.
                        with db.begin_nested():
                            db.delete(row)
                            db.flush()
            db.delete(orphan)
        db.commit()
        print(f"\nMerged and removed {len(pairs)} duplicate item(s).")


if __name__ == "__main__":
    main()
