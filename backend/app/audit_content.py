"""
Content audit: report items whose meanings look unanswerable.

Read-only. Scans the items table for translations that are dictionary prose
rather than short typeable answers: over-long strings, sentence punctuation,
and known Wiktionary boilerplate ("letter of the Russian alphabet",
"Translated as", ...). Run it against any environment's database to find
content that predates the pipeline curation stage (pipeline/curate.py).

Usage:
    cd backend && python -m app.audit_content            # summary + findings
    cd backend && python -m app.audit_content --json     # machine-readable
"""

from __future__ import annotations

import argparse
import json
import re

from sqlalchemy import select

from app.content.importer import MAX_TRANSLATION_LEN
from app.db import SessionLocal
from app.models import Item

_BOILERPLATE = [
    re.compile(r"letter of the (Russian|Cyrillic) alphabet", re.IGNORECASE),
    re.compile(r"\btranslated as\b", re.IGNORECASE),
    re.compile(r"^(Used|Optionally used|Only used|Also used)\b"),
]
_SENTENCE_PUNCT = re.compile(r"[.;:]")


def _problems(text: str) -> list[str]:
    problems = []
    if len(text) > MAX_TRANSLATION_LEN:
        problems.append(f"longer than {MAX_TRANSLATION_LEN} chars")
    if _SENTENCE_PUNCT.search(text.rstrip(".")):
        problems.append("sentence punctuation")
    for pattern in _BOILERPLATE:
        if pattern.search(text):
            problems.append(f"boilerplate: {pattern.pattern}")
    return problems


def audit(db) -> list[dict]:
    findings = []
    for item in db.scalars(select(Item).order_by(Item.level, Item.frequency_rank)):
        texts = [item.translation_primary] + [
            t for t in (item.translations or []) if t != item.translation_primary
        ]
        item_problems = []
        for text in texts:
            if not isinstance(text, str):
                continue
            for problem in _problems(text):
                item_problems.append({"text": text, "problem": problem})
        if item_problems:
            findings.append({
                "external_id": item.external_id,
                "lemma": item.lemma,
                "level": item.level,
                "problems": item_problems,
            })
    return findings


def main() -> None:
    ap = argparse.ArgumentParser(description="Report items with unanswerable meanings")
    ap.add_argument("--json", action="store_true", help="print findings as JSON")
    args = ap.parse_args()

    with SessionLocal() as db:
        total = db.scalar(select(Item.id).limit(1))
        findings = audit(db)

    if args.json:
        print(json.dumps(findings, ensure_ascii=False, indent=2))
        return

    if total is None:
        print("The items table is empty.")
        return
    if not findings:
        print("No problems found: every meaning looks like a short, typeable answer.")
        return
    print(f"{len(findings)} item(s) with unanswerable-looking meanings:\n")
    for f in findings:
        print(f"  {f['external_id']}  (level {f['level']})  {f['lemma']}")
        for p in f["problems"]:
            text = p["text"] if len(p["text"]) <= 70 else p["text"][:67] + "..."
            print(f"    - {p['problem']}: {text}")
    print(
        "\nFix: re-run the content pipeline (its curate stage produces short answers"
        "\nand moves prose into notes), then reload with load_seed.py. Letter entries"
        "\ncan be removed with pipeline/cleanup_letter_items.py."
    )


if __name__ == "__main__":
    main()
