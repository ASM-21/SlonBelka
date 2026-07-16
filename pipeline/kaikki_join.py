"""
Stage 2: join lemmas.json against the Kaikki (Wiktextract) Russian dump.

Reuses the field-extraction logic from spike_data_check.py so the real
pipeline and the spike never disagree about what counts as a stress mark,
a lemma, or native audio.

Usage:
    python kaikki_join.py --kaikki /path/to/kaikki.org-dictionary-Russian.jsonl
    python kaikki_join.py --kaikki ./russian.jsonl.gz --lemmas ./out/lemmas.json

Output: ./out/joined.json, a list of per-lemma records (found and not-found),
carrying everything the level/audio stages need: stressed_form, gloss(es),
part_of_speech, gender, aspect, ipa, and candidate native-audio URLs with
whatever attribution text Kaikki ships for each file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from spike_data_check import (
    best_entry,
    build_index,
    extract_stressed_form,
    has_stress_mark,
    is_form_of,
    iter_kaikki_local,
    iter_kaikki_package,
)

OUT_DIR = Path("./out")

# Kaikki gender tags -> our schema's single-letter gender.
GENDER_MAP = {"masculine": "m", "feminine": "f", "neuter": "n"}
ASPECT_TAGS = {"imperfective", "perfective"}


def extract_pos(entry: dict) -> str | None:
    return entry.get("pos") or None


def extract_gender(entry: dict) -> str | None:
    tags = set(entry.get("tags", []))
    for kaikki_tag, ours in GENDER_MAP.items():
        if kaikki_tag in tags:
            return ours
    return None


def extract_aspect(entry: dict) -> str | None:
    tags = set(entry.get("tags", []))
    found = tags & ASPECT_TAGS
    return next(iter(found)) if found else None


def extract_ipa(entry: dict) -> str | None:
    for sound in entry.get("sounds", []):
        ipa = sound.get("ipa")
        if ipa:
            return ipa
    return None


def extract_glosses(entry: dict, limit: int = 5) -> list[str]:
    seen: list[str] = []
    for sense in entry.get("senses", []):
        for gloss in sense.get("glosses", []):
            gloss = gloss.strip()
            if gloss and gloss not in seen:
                seen.append(gloss)
            if len(seen) >= limit:
                return seen
    return seen


def extract_native_audio(entry: dict) -> list[dict]:
    """Every candidate audio file for this entry, most-preferred first."""
    candidates = []
    for sound in entry.get("sounds", []):
        url = sound.get("mp3_url") or sound.get("ogg_url") or sound.get("audio")
        if not url:
            continue
        candidates.append({
            "url": url,
            # Kaikki doesn't carry a per-file license string; Wiktionary audio
            # is Commons-hosted and CC-licensed, license text lives on the file
            # page. Record what we can and flag for the licensing review (E4).
            "license": "CC (Wikimedia Commons, verify per-file on the file page)",
            "attribution": sound.get("text") or "Wiktionary / Wikimedia Commons contributors",
        })
    return candidates


def join(lemmas: list[dict], entry_iter) -> list[dict]:
    wanted = {row["lemma"] for row in lemmas}
    print("Streaming Kaikki dictionary (this takes a few minutes)...")
    index = build_index(entry_iter, wanted)

    out = []
    for row in lemmas:
        lemma = row["lemma"]
        entries = index.get(lemma)
        if not entries:
            out.append({**row, "found": False})
            continue
        e = best_entry(entries)
        stressed = extract_stressed_form(e)
        out.append({
            **row,
            "found": True,
            "is_lemma": not is_form_of(e),
            "stressed_form": stressed or lemma,
            "has_stress": has_stress_mark(stressed),
            "part_of_speech": extract_pos(e) or row.get("pos"),
            "gender": extract_gender(e),
            "aspect": extract_aspect(e),
            "ipa": extract_ipa(e),
            "glosses": extract_glosses(e),
            "native_audio": extract_native_audio(e),
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Join lemmas against Kaikki")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--kaikki", type=Path)
    src.add_argument("--use-kaikki-json", action="store_true")
    ap.add_argument("--lemmas", type=Path, default=OUT_DIR / "lemmas.json")
    ap.add_argument("--out", type=Path, default=OUT_DIR / "joined.json")
    args = ap.parse_args()

    if not args.lemmas.exists():
        sys.exit(f"{args.lemmas} not found. Run lemmatize.py first.")
    lemmas = json.loads(args.lemmas.read_text(encoding="utf-8"))

    if args.use_kaikki_json:
        entry_iter = iter_kaikki_package()
    else:
        if not args.kaikki.exists():
            sys.exit(f"File not found: {args.kaikki}")
        entry_iter = iter_kaikki_local(args.kaikki)

    rows = join(lemmas, entry_iter)

    found = [r for r in rows if r["found"]]
    with_stress = [r for r in found if r.get("has_stress")]
    with_audio = [r for r in found if r.get("native_audio")]
    print(f"\n{len(found)}/{len(rows)} lemmas found in Kaikki")
    print(f"  {len(with_stress)}/{len(found)} have a stress mark")
    print(f"  {len(with_audio)}/{len(found)} have at least one native audio candidate")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written to {args.out}")


if __name__ == "__main__":
    main()
