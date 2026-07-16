"""
One-off cleanup: remove leftover seed_dev.py demo items that the real content
pipeline never touched (still audio_url IS NULL after load_seed.py).

Dry-run by default — just reports what it would delete and flags anything
that has dependent rows (review history, SRS state, mnemonics, etc.) so you
can decide those by hand rather than having them silently deleted.

Usage:
    python cleanup_demo_items.py                # report only, deletes nothing
    python cleanup_demo_items.py --execute       # actually delete the safe ones
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from sqlalchemy import select  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    ExampleSentence, Item, LessonEvent, Mnemonic, ReviewEvent, UserItemState,
)

# Tables that FK to items.id. If a row exists in any of these for an item,
# it's not safe to delete without a human decision.
DEPENDENT_MODELS = [ExampleSentence, Mnemonic, UserItemState, ReviewEvent, LessonEvent]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true", help="actually delete; default is dry-run")
    args = ap.parse_args()

    with SessionLocal() as db:
        orphans = db.scalars(select(Item).where(Item.audio_url.is_(None))).all()
        if not orphans:
            print("No items with audio_url IS NULL. Nothing to do.")
            return

        safe_to_delete = []
        blocked = []
        for item in orphans:
            has_deps = any(
                db.scalar(select(model.id).where(model.item_id == item.id).limit(1))
                for model in DEPENDENT_MODELS
            )
            (blocked if has_deps else safe_to_delete).append(item)

        print(f"{len(orphans)} items with no audio (leftover demo data or pipeline gaps):")
        print(f"  {len(safe_to_delete)} safe to delete (no dependent rows)")
        print(f"  {len(blocked)} blocked (have review/SRS/mnemonic history, not touched)")

        if blocked:
            print("\nBlocked (left alone, decide by hand):")
            for item in blocked:
                print(f"  {item.external_id}  {item.lemma}")

        if not args.execute:
            print("\nDry run only. Rerun with --execute to actually delete the safe ones.")
            if safe_to_delete:
                print("\nWould delete:")
                for item in safe_to_delete:
                    print(f"  {item.external_id}  {item.lemma}")
            return

        for item in safe_to_delete:
            db.delete(item)
        db.commit()
        print(f"\nDeleted {len(safe_to_delete)} items.")


if __name__ == "__main__":
    main()
