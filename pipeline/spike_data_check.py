#!/usr/bin/env python3
"""
Slonbelka content-pipeline spike.

Goal: before building anything, find out whether the curated-deck data foundation
is solid. This joins the top-N Russian frequency tokens against the Kaikki
(Wiktextract) Russian dictionary and reports three things:

  1. Stressed-form coverage  - can we get a stress-marked spelling for each word?
  2. Native audio coverage    - does Wiktionary ship a pronunciation file?
  3. Usable English gloss      - is there a clean translation to quiz against?

It also reports the lemma-vs-inflected-form breakdown, which is the real risk:
a raw OpenSubtitles frequency list is full of surface forms (меня, было, что),
not dictionary headwords. If most top tokens are inflected forms or function
words, the pipeline needs a lemmatized frequency source, not this raw list.

Stdlib only. No pip install required.

------------------------------------------------------------------------------
PREREQUISITES
------------------------------------------------------------------------------
1. Frequency list: downloaded automatically from hermitdave/FrequencyWords
   (small, ~1 MB). No action needed.

2. Kaikki Russian dictionary (~770 MB JSONL). Download it once:
       https://kaikki.org/dictionary/Russian/
   Look for "Download postprocessed JSONL data for all word senses".
   The direct file is usually:
       https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl
   If that 404s, grab the current link from the page above.
   Save it anywhere and pass --kaikki /path/to/file.jsonl (or .jsonl.gz).

   Easiest alternative (handles the download for you):
       pip install kaikki-json
   then use --use-kaikki-json instead of --kaikki.

------------------------------------------------------------------------------
USAGE
------------------------------------------------------------------------------
    python spike_data_check.py --kaikki ./kaikki.org-dictionary-Russian.jsonl
    python spike_data_check.py --kaikki ./russian.jsonl.gz --n 200
    python spike_data_check.py --use-kaikki-json --n 100

Outputs a summary to stdout and a full per-word CSV to ./out/spike_report.csv
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
import unicodedata
import urllib.request
from pathlib import Path

FREQ_URL = (
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/"
    "master/content/2018/ru/ru_50k.txt"
)
COMBINING_ACUTE = "\u0301"
OUT_DIR = Path("./out")


# --------------------------------------------------------------------------- #
# Data loading
# --------------------------------------------------------------------------- #
def load_frequency_tokens(n: int, cache: Path = Path("./out/ru_50k.txt")) -> list[str]:
    """Return the top-n Russian tokens by frequency, lowercased."""
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists():
        print(f"Downloading frequency list -> {cache}")
        urllib.request.urlretrieve(FREQ_URL, cache)
    tokens: list[str] = []
    with cache.open(encoding="utf-8") as fh:
        for line in fh:
            parts = line.split()
            if not parts:
                continue
            tokens.append(parts[0].strip().lower())
            if len(tokens) >= n:
                break
    return tokens


def iter_kaikki_local(path: Path):
    """Yield JSON objects from a Kaikki JSONL file (.jsonl or .jsonl.gz)."""
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def iter_kaikki_package():
    """Yield JSON objects via the optional kaikki-json package."""
    try:
        from kaikki_json import iter_items_in
    except ImportError:
        sys.exit(
            "kaikki-json is not installed. Run `pip install kaikki-json` "
            "or use --kaikki with a downloaded file instead."
        )
    yield from iter_items_in("ru")


def build_index(entry_iter, wanted: set[str]) -> dict[str, list[dict]]:
    """
    Stream the Kaikki data once and keep only entries whose headword is in
    `wanted`. A headword can have several entries (one per part of speech).
    """
    index: dict[str, list[dict]] = {}
    scanned = 0
    for entry in entry_iter:
        scanned += 1
        if scanned % 200_000 == 0:
            print(f"  scanned {scanned:,} entries...")
        word = entry.get("word")
        if not word:
            continue
        key = word.strip().lower()
        if key in wanted:
            index.setdefault(key, []).append(entry)
    print(f"  scanned {scanned:,} entries total")
    return index


# --------------------------------------------------------------------------- #
# Field extraction (mirrors the fields the real pipeline will use)
# --------------------------------------------------------------------------- #
def extract_stressed_form(entry: dict) -> str | None:
    """
    The stress-marked spelling lives in `forms` under the 'canonical' tag,
    e.g. {"form": "молоко\u0301", "tags": ["canonical"]}.
    """
    for form in entry.get("forms", []):
        tags = form.get("tags", [])
        value = form.get("form", "")
        if "canonical" in tags and value:
            return value
    return None


def has_stress_mark(text: str | None) -> bool:
    if not text:
        return False
    # Either a combining acute, or the entry is a single-syllable word where
    # stress is unambiguous (one vowel).
    if COMBINING_ACUTE in unicodedata.normalize("NFD", text):
        return True
    vowels = sum(1 for ch in text.lower() if ch in "аеёиоуыэюя")
    return vowels <= 1


def has_native_audio(entry: dict) -> bool:
    for sound in entry.get("sounds", []):
        if sound.get("mp3_url") or sound.get("ogg_url") or sound.get("audio"):
            return True
    return False


def first_gloss(entry: dict) -> str | None:
    for sense in entry.get("senses", []):
        glosses = sense.get("glosses")
        if glosses:
            return glosses[0]
    return None


def is_form_of(entry: dict) -> bool:
    """True if every sense is an inflected form of another word (not a lemma)."""
    senses = entry.get("senses", [])
    if not senses:
        return False
    for sense in senses:
        if sense.get("form_of") or sense.get("alt_of"):
            continue
        tags = sense.get("tags", [])
        if any(t in tags for t in ("form-of", "inflection-of", "alternative")):
            continue
        return False  # found a real, non-form-of sense -> it is a lemma
    return True


def best_entry(entries: list[dict]) -> dict:
    """Prefer a lemma entry over a form-of entry when a token has several."""
    lemmas = [e for e in entries if not is_form_of(e)]
    return lemmas[0] if lemmas else entries[0]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="Slonbelka content-pipeline spike")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--kaikki", type=Path, help="Path to Kaikki Russian .jsonl(.gz)")
    src.add_argument("--use-kaikki-json", action="store_true",
                     help="Use the kaikki-json pip package to fetch the data")
    ap.add_argument("--n", type=int, default=100, help="Top-N frequency tokens")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nLoading top {args.n} frequency tokens...")
    tokens = load_frequency_tokens(args.n)
    wanted = set(tokens)

    print("Streaming Kaikki Russian dictionary (this takes a minute)...")
    if args.use_kaikki_json:
        index = build_index(iter_kaikki_package(), wanted)
    else:
        if not args.kaikki.exists():
            sys.exit(f"File not found: {args.kaikki}\nSee PREREQUISITES at the top.")
        index = build_index(iter_kaikki_local(args.kaikki), wanted)

    rows = []
    for rank, tok in enumerate(tokens, start=1):
        entries = index.get(tok)
        if not entries:
            rows.append({
                "rank": rank, "token": tok, "found": False, "is_lemma": "",
                "pos": "", "stressed_form": "", "has_stress": "",
                "has_audio": "", "gloss": "",
            })
            continue
        e = best_entry(entries)
        stressed = extract_stressed_form(e)
        gloss = first_gloss(e)
        rows.append({
            "rank": rank, "token": tok, "found": True,
            "is_lemma": not is_form_of(e), "pos": e.get("pos", ""),
            "stressed_form": stressed or "", "has_stress": has_stress_mark(stressed),
            "has_audio": has_native_audio(e), "gloss": (gloss or "")[:60],
        })

    # ---- summary ----
    found = [r for r in rows if r["found"]]
    lemmas = [r for r in found if r["is_lemma"] is True]
    n = len(rows)

    def pct(k, base):
        return f"{(100 * k / base):.0f}%" if base else "n/a"

    n_found = len(found)
    n_lemma = len(lemmas)
    n_formof = n_found - n_lemma
    n_stress_all = sum(1 for r in found if r["has_stress"] is True)
    n_stress_lem = sum(1 for r in lemmas if r["has_stress"] is True)
    n_audio_all = sum(1 for r in found if r["has_audio"] is True)
    n_gloss_lem = sum(1 for r in lemmas if r["gloss"])

    print("\n" + "=" * 64)
    print(f"SPIKE RESULTS  (top {n} frequency tokens)")
    print("=" * 64)
    print(f"Found in Wiktionary:        {n_found:>4} / {n}   ({pct(n_found, n)})")
    print(f"  of which lemmas:          {n_lemma:>4}        ({pct(n_lemma, n_found)} of found)")
    print(f"  of which inflected/form:  {n_formof:>4}        ({pct(n_formof, n_found)} of found)")
    print("-" * 64)
    print("Coverage among LEMMAS (the words a curated deck would actually use):")
    print(f"  stressed form available:  {n_stress_lem:>4} / {n_lemma}   ({pct(n_stress_lem, n_lemma)})")
    print(f"  native audio available:   {sum(1 for r in lemmas if r['has_audio'] is True):>4} / {n_lemma}   ({pct(sum(1 for r in lemmas if r['has_audio'] is True), n_lemma)})")
    print(f"  usable English gloss:     {n_gloss_lem:>4} / {n_lemma}   ({pct(n_gloss_lem, n_lemma)})")
    print("-" * 64)
    print("Coverage among ALL found entries:")
    print(f"  stressed form available:  {n_stress_all:>4} / {n_found}   ({pct(n_stress_all, n_found)})")
    print(f"  native audio available:   {n_audio_all:>4} / {n_found}   ({pct(n_audio_all, n_found)})")
    print("=" * 64)

    # ---- verdict ----
    print("\nVERDICT")
    if n_lemma and n_stress_lem / n_lemma >= 0.9:
        print("  + Stress extraction looks reliable for lemmas. Foundation is solid.")
    else:
        print("  ! Stress coverage for lemmas is weak. Add OpenRussian as a second")
        print("    source, or derive stress with a morphology tool, before scaling.")
    if n_found and n_formof / n_found >= 0.4:
        print("  ! Many top tokens are inflected forms or function words, not lemmas.")
        print("    Use a LEMMATIZED frequency list for ordering (e.g. RNC lemma")
        print("    frequencies, or lemmatize this list with pymorphy3) instead of the")
        print("    raw surface-form list. This is the main thing to fix in the pipeline.")
    if n_lemma and n_audio_all / max(1, n_lemma) < 0.5:
        print("  - Native audio coverage is partial (expected). TTS fallback will")
        print("    cover the gaps, per the design doc.")

    # ---- per-word CSV ----
    csv_path = OUT_DIR / "spike_report.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nFull per-word report written to {csv_path}")

    # ---- sample table ----
    print("\nSample (first 25):")
    print(f"{'#':>3}  {'token':<14}{'lemma':<6}{'stress':<7}{'audio':<6}gloss")
    for r in rows[:25]:
        if not r["found"]:
            print(f"{r['rank']:>3}  {r['token']:<14}{'-- not found --'}")
            continue
        print(
            f"{r['rank']:>3}  {r['token']:<14}"
            f"{('yes' if r['is_lemma'] else 'no'):<6}"
            f"{('yes' if r['has_stress'] else 'no'):<7}"
            f"{('yes' if r['has_audio'] else 'no'):<6}"
            f"{r['gloss']}"
        )


if __name__ == "__main__":
    main()
