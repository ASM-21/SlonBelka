"""
Stage 1: lemmatize the raw frequency list.

The raw hermitdave list is surface forms (меня, было, домов), not dictionary
headwords. This collapses each token to its lemma with pymorphy3 and re-ranks
by the best (lowest) rank any surface form of that lemma achieved. Proper
nouns and single-character noise are dropped.

Usage:
    python lemmatize.py --n 1600
    python lemmatize.py --n 1600 --out ./out/lemmas.json

Output: ./out/lemmas.json, a list of
    {"rank": int, "lemma": str, "pos": str, "is_proper_noun": bool}
ordered by rank, one row per unique lemma.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pymorphy3

from spike_data_check import load_frequency_tokens

OUT_DIR = Path("./out")

# pymorphy3 POS tags -> our schema's part_of_speech strings.
POS_MAP = {
    "NOUN": "noun",
    "VERB": "verb",
    "INFN": "verb",
    "ADJF": "adjective",
    "ADJS": "adjective",
    "COMP": "adjective",
    "ADVB": "adverb",
    "PRED": "adverb",
    "PREP": "preposition",
    "CONJ": "conjunction",
    "PRCL": "particle",
    "INTJ": "interjection",
    "NPRO": "pronoun",
    "NUMR": "numeral",
}
PROPER_NOUN_GRAMMEMES = {"Name", "Surn", "Patr", "Geox", "Orgn"}


def lemmatize_tokens(tokens: list[str], morph: pymorphy3.MorphAnalyzer) -> list[dict]:
    """Collapse ranked tokens to unique lemmas, keeping the best rank per lemma."""
    best: dict[str, dict] = {}
    for rank, tok in enumerate(tokens, start=1):
        if not tok or not tok.isalpha():
            continue
        parse = morph.parse(tok)[0]
        lemma = parse.normal_form
        pos_raw = parse.tag.POS
        is_proper = bool(PROPER_NOUN_GRAMMEMES & set(parse.tag.grammemes))
        if lemma in best:
            continue  # first occurrence is the best rank, since tokens are pre-sorted
        best[lemma] = {
            "rank": rank,
            "lemma": lemma,
            "pos": POS_MAP.get(pos_raw, pos_raw.lower() if pos_raw else None),
            "is_proper_noun": is_proper,
        }
    # Re-rank sequentially in original best-rank order (rank compression after collapse).
    ordered = sorted(best.values(), key=lambda r: r["rank"])
    for i, row in enumerate(ordered, start=1):
        row["rank"] = i
    return ordered


def main() -> None:
    ap = argparse.ArgumentParser(description="Lemmatize the Russian frequency list")
    ap.add_argument("--n", type=int, default=1600,
                     help="How many raw frequency tokens to pull before lemmatizing "
                          "(needs to be well above the target lemma count, since many "
                          "surface forms collapse to the same lemma)")
    ap.add_argument("--out", type=Path, default=OUT_DIR / "lemmas.json")
    ap.add_argument("--include-proper-nouns", action="store_true",
                     help="Keep names/places instead of dropping them")
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    print(f"Loading top {args.n} raw frequency tokens...")
    tokens = load_frequency_tokens(args.n)

    print("Lemmatizing with pymorphy3...")
    morph = pymorphy3.MorphAnalyzer()
    lemmas = lemmatize_tokens(tokens, morph)

    if not args.include_proper_nouns:
        before = len(lemmas)
        lemmas = [row for row in lemmas if not row["is_proper_noun"]]
        for i, row in enumerate(lemmas, start=1):
            row["rank"] = i
        print(f"Dropped {before - len(lemmas)} proper nouns.")

    args.out.write_text(json.dumps(lemmas, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(tokens)} raw tokens -> {len(lemmas)} unique lemmas -> {args.out}")


if __name__ == "__main__":
    main()
