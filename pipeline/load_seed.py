"""
Stage 5: validate and load ./out/levels/*.json into the database.

The only supported way to load content: goes through
app.content.importer.upsert_items, which upserts on external_id so existing
rows keep their id and every bit of user progress that references them.
Never truncate-and-reinsert.

Reads DATABASE_URL the same way the backend does (via app.config.settings),
so point it at whatever database the backend is currently configured for.

Usage:
    python load_seed.py                       # validate + load
    python load_seed.py --validate-only        # just check, don't write
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.content.importer import upsert_items, validate_item  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402

OUT_DIR = Path("./out")

# Stricter than importer.validate_item: the design doc's seed-validation gate
# (docs/slonbelka-design-doc.md section 16) also requires POS and a reachable
# audio_url before something ships, not just the four importer-required fields.
def seed_gate(rec: dict) -> list[str]:
    problems = validate_item(rec)
    if not rec.get("part_of_speech"):
        problems.append("missing part_of_speech")
    if not rec.get("audio_url"):
        problems.append("missing audio_url (run audio.py first)")
    return problems


def load_records(levels_dir: Path) -> list[dict]:
    records = []
    for path in sorted(levels_dir.glob("level_*.json")):
        records.extend(json.loads(path.read_text(encoding="utf-8")))
    return records


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate and load the seed into the database")
    ap.add_argument("--levels-dir", type=Path, default=OUT_DIR / "levels")
    ap.add_argument("--validate-only", action="store_true")
    args = ap.parse_args()

    if not args.levels_dir.exists():
        sys.exit(f"{args.levels_dir} not found. Run levels.py (and audio.py) first.")
    records = load_records(args.levels_dir)
    if not records:
        sys.exit("No records found.")

    errors = []
    for rec in records:
        for problem in seed_gate(rec):
            errors.append(f"{rec.get('lemma', '?')} ({rec.get('external_id', '?')}): {problem}")
    if errors:
        print(f"{len(errors)} problems, nothing loaded:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"{len(records)} records pass the seed-validation gate.")
    if args.validate_only:
        return

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        result = upsert_items(db, records)
    print(f"Loaded: {result['created']} created, {result['updated']} updated, "
          f"{result['total']} total.")


if __name__ == "__main__":
    main()
