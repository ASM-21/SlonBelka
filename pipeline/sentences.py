#!/usr/bin/env python3
"""
Example-sentence stage (C2): join Tatoeba sentences to deck items.

Standalone and stdlib-only. Inputs:

  --items          JSON list of {"external_id": ..., "lemma": ...} for the
                   deck (export it from the DB; see the README).
  --rus-sentences  Tatoeba sentences export filtered to Russian
                   (TSV: id, lang, text).
  --eng-sentences  Tatoeba sentences export filtered to English (same shape).
  --links          Tatoeba links export (TSV: sentence_id, translation_id).
  --out            Output artifact path (JSON).

Download the exports from https://downloads.tatoeba.org/exports/ (sentences
and links; per-language files live under per_language/). Never fetched here.

Selection per lemma: sentences containing the exact lemma as a word,
case-insensitive and folding ё to е, that have an English translation and fit
under --max-len characters; the shortest --per-lemma sentences win. Known
limitation: this matches the lemma form only, so heavily inflected words get
fewer (or zero) hits. A morphology-aware pass can come later.

The artifact is loaded with: python -m app.load_sentences <artifact>
(idempotent; see backend/app/content/sentences.py).
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime, timezone

SOURCE = "tatoeba"
LICENSE = "CC-BY 2.0 FR"
ATTRIBUTION = "Sentences from Tatoeba (https://tatoeba.org), licensed CC-BY 2.0 FR"

_WORD_RE = re.compile(r"[а-яё]+(?:-[а-яё]+)*")


def fold(text: str) -> str:
    """Case- and ё/е-insensitive comparison form."""
    return text.lower().replace("ё", "е")


def sentence_words(text: str) -> set[str]:
    """Cyrillic words in a sentence, folded (hyphenated compounds count as one)."""
    return set(_WORD_RE.findall(fold(text)))


def read_sentences_tsv(path: str, lang: str) -> dict[int, str]:
    """Tatoeba sentences export: id<TAB>lang<TAB>text, one per line."""
    out: dict[int, str] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3 and parts[1] == lang:
                out[int(parts[0])] = parts[2]
    return out


def read_links_tsv(path: str) -> list[tuple[int, int]]:
    """Tatoeba links export: sentence_id<TAB>translation_id."""
    pairs: list[tuple[int, int]] = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                try:
                    pairs.append((int(parts[0]), int(parts[1])))
                except ValueError:
                    continue
    return pairs


def build_translation_map(
    links: list[tuple[int, int]], eng: dict[int, str]
) -> dict[int, str]:
    """Russian sentence id to its first English translation."""
    out: dict[int, str] = {}
    for a, b in links:
        if a not in out and b in eng:
            out[a] = eng[b]
    return out


def select_sentences(
    items: list[dict],
    rus: dict[int, str],
    translations: dict[int, str],
    per_lemma: int = 2,
    max_len: int = 80,
) -> list[dict]:
    """Pick up to per_lemma short, translated sentences per item lemma."""
    index: dict[str, list[int]] = defaultdict(list)
    for sid, text in rus.items():
        if len(text) > max_len or sid not in translations:
            continue
        for word in sentence_words(text):
            index[word].append(sid)

    records: list[dict] = []
    for item in items:
        key = fold(item["lemma"].strip())
        candidates = sorted(index.get(key, ()), key=lambda sid: (len(rus[sid]), sid))
        for sid in candidates[:per_lemma]:
            records.append(
                {
                    "item_external_id": item["external_id"],
                    "source_ref": f"tatoeba:{sid}",
                    "ru_text": rus[sid],
                    "en_text": translations[sid],
                    "source": SOURCE,
                    "license": LICENSE,
                }
            )
    return records


def build_artifact(records: list[dict]) -> dict:
    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": SOURCE,
        "license": LICENSE,
        "attribution": ATTRIBUTION,
        "sentences": records,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--items", required=True)
    ap.add_argument("--rus-sentences", required=True)
    ap.add_argument("--eng-sentences", required=True)
    ap.add_argument("--links", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--per-lemma", type=int, default=2)
    ap.add_argument("--max-len", type=int, default=80)
    args = ap.parse_args()

    with open(args.items, encoding="utf-8") as f:
        items = json.load(f)
    rus = read_sentences_tsv(args.rus_sentences, "rus")
    eng = read_sentences_tsv(args.eng_sentences, "eng")
    links = read_links_tsv(args.links)
    translations = build_translation_map(links, eng)

    records = select_sentences(
        items, rus, translations, per_lemma=args.per_lemma, max_len=args.max_len
    )
    artifact = build_artifact(records)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(artifact, f, ensure_ascii=False, indent=1)

    covered = len({r["item_external_id"] for r in records})
    print(f"{len(records)} sentences for {covered}/{len(items)} items -> {args.out}")


if __name__ == "__main__":
    main()
