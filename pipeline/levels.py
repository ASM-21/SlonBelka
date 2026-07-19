"""
Stage 3: turn joined.json into leveled content records.

Drops anything that can't ship (per PRODUCTION_READINESS.md Decision 2 and
the seed-validation gate: no item without a stressed_form), re-ranks the
survivors, and buckets them into levels of a fixed size. Assigns
external_id via the same helper the backend importer uses, so ids here and
in the database always agree.

Usage:
    python levels.py
    python levels.py --joined ./out/joined.json --level-size 30 --max-words 1500

Output: ./out/levels/level_XXX.json per level, each a list of content
records matching the upsert_items schema (audio_url left null; the audio
stage fills it in). Also writes ./out/levels/_dropped.json for the audit
trail of anything excluded and why.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.content.slugs import default_external_id  # noqa: E402

from curate import curate_glosses, is_letter_entry  # noqa: E402

OUT_DIR = Path("./out")


def eligible(row: dict) -> tuple[bool, str | None]:
    """Whether a joined record is good enough to ship. Returns (ok, reason_if_not)."""
    if not row.get("found"):
        return False, "not found in Kaikki"
    if row.get("is_lemma") is False:
        return False, "best entry was an inflected form, not a lemma"
    if not row.get("stressed_form"):
        return False, "no stressed form"
    if not row.get("glosses"):
        return False, "no usable gloss"
    if is_letter_entry(row["glosses"]):
        return False, "alphabet letter, not vocabulary"
    return True, None


def build_records(rows: list[dict], level_size: int, max_words: int | None) -> tuple[list[dict], list[dict]]:
    kept, dropped = [], []
    for row in rows:
        ok, reason = eligible(row)
        if not ok:
            dropped.append({"lemma": row["lemma"], "rank": row["rank"], "reason": reason})
            continue
        kept.append(row)

    if max_words is not None:
        kept = kept[:max_words]

    records = []
    i = 0
    for row in kept:
        pos = row.get("part_of_speech")
        # Raw glosses are dictionary prose; ship short typeable answers and
        # keep the prose as a description (Item.notes) for display.
        answers, description = curate_glosses(row["glosses"])
        if not answers:
            dropped.append({
                "lemma": row["lemma"], "rank": row["rank"],
                "reason": "no concise answer derivable from glosses",
            })
            continue
        i += 1
        level = (i - 1) // level_size + 1
        records.append({
            "external_id": default_external_id(row["lemma"], pos, 0),
            "type": "vocab",
            "level": level,
            "lemma": row["lemma"],
            "stressed_form": row["stressed_form"],
            "translation_primary": answers[0],
            "translations": answers,
            "part_of_speech": pos,
            "gender": row.get("gender"),
            "aspect": row.get("aspect"),
            "ipa": row.get("ipa"),
            "audio_url": None,
            "frequency_rank": i,
            "notes": description,
            # carried through for the audio stage only, stripped before load
            "_native_audio_candidates": row.get("native_audio", []),
        })
    return records, dropped


def main() -> None:
    ap = argparse.ArgumentParser(description="Bucket joined lemmas into levels")
    ap.add_argument("--joined", type=Path, default=OUT_DIR / "joined.json")
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR / "levels")
    ap.add_argument("--level-size", type=int, default=25)
    ap.add_argument("--max-words", type=int, default=None,
                     help="Cap the deck size (design doc default v1 target: 1500)")
    args = ap.parse_args()

    if not args.joined.exists():
        sys.exit(f"{args.joined} not found. Run kaikki_join.py first.")
    rows = json.loads(args.joined.read_text(encoding="utf-8"))

    records, dropped = build_records(rows, args.level_size, args.max_words)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    by_level: dict[int, list[dict]] = {}
    for rec in records:
        by_level.setdefault(rec["level"], []).append(rec)
    for level, recs in by_level.items():
        path = args.out_dir / f"level_{level:03d}.json"
        path.write_text(json.dumps(recs, ensure_ascii=False, indent=2), encoding="utf-8")

    (args.out_dir / "_dropped.json").write_text(
        json.dumps(dropped, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"{len(rows)} joined lemmas -> {len(records)} shippable words -> {len(by_level)} levels")
    print(f"Dropped {len(dropped)} (see {args.out_dir / '_dropped.json'})")
    print(f"Written to {args.out_dir}/level_001.json .. level_{max(by_level):03d}.json")


if __name__ == "__main__":
    main()
