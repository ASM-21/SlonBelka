"""
Load an example-sentence artifact into the database.

Usage:
    python -m app.load_sentences path/to/sentences.json

The artifact is produced by pipeline/sentences.py. Loading is idempotent:
rerunning the same artifact changes nothing (see content/sentences.py).
"""

from __future__ import annotations

import json
import sys

from app.db import SessionLocal
from app.content.sentences import upsert_sentences


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        artifact = json.load(f)
    records = artifact["sentences"] if isinstance(artifact, dict) else artifact
    with SessionLocal() as db:
        result = upsert_sentences(db, records)
    skipped = result["skipped"]
    print(
        f"created={result['created']} updated={result['updated']} "
        f"skipped={len(skipped)} total={result['total']}"
    )
    if skipped:
        unique = sorted(set(skipped))
        print(f"skipped item_external_ids ({len(unique)} unique): {', '.join(unique[:20])}"
              + (" ..." if len(unique) > 20 else ""))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    main(sys.argv[1])
