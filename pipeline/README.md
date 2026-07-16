# Content pipeline

For v1 the deck is curated and frequency-ordered, built from open data. Before building any of that, run the spike to confirm the data foundation holds.

**The real pipeline (lemmatize -> join -> level -> audio -> load) is built and has been run against production.** See [`CONTENT_PIPELINE.md`](./CONTENT_PIPELINE.md) for how to run it end to end. This README still covers the spike, which is worth running once against the real Kaikki file for the coverage numbers A2 asks for, plus the sentences stage below.

## Example sentences: `sentences.py` (stage C2)

Joins Tatoeba sentence exports to the deck and emits a versioned JSON artifact for the backend loader. Standalone and stdlib-only; it never touches the network or the database.

### Inputs

1. The deck items as JSON: a list of `{"external_id": ..., "lemma": ...}`. Export it with a one-liner against your database, for example:

```bash
cd ../backend
python -c "from app.db import SessionLocal; from app.models import Item; import json; db = SessionLocal(); print(json.dumps([{'external_id': i.external_id, 'lemma': i.lemma} for i in db.query(Item).all()], ensure_ascii=False))" > ../pipeline/items.json
```

2. Tatoeba exports from https://downloads.tatoeba.org/exports/ (attribute Tatoeba and contributors, sentences are CC-BY 2.0 FR):
   - `per_language/rus/rus_sentences.tsv` (id, lang, text)
   - `per_language/eng/eng_sentences.tsv`
   - `links.csv` (sentence_id, translation_id; the full export works, a per-language subset is faster)

### Run

```bash
python sentences.py --items items.json \
  --rus-sentences rus_sentences.tsv --eng-sentences eng_sentences.tsv \
  --links links.csv --out sentences_artifact.json
```

Selection per lemma: exact-word match (case-insensitive, ё folded to е), an English translation required, at most 80 characters, shortest first, up to 2 per lemma (`--per-lemma`, `--max-len`). Known limitation: lemma-form matching only, so heavily inflected words get fewer hits.

### Load

```bash
cd ../backend
python -m app.load_sentences ../pipeline/sentences_artifact.json
```

Loading is idempotent: it upserts on `(item, source_ref)`, so rerunning the same artifact is a zero-diff no-op and edited translations update in place. Unknown `external_id`s are skipped and reported, malformed records abort the whole load. Sentence audio stays NULL for now; a TTS stage can fill `audio_url` later.

Tests: `python -m pytest -q` from this directory (fixture data only, no downloads).

## The spike: `spike_data_check.py`

It joins the top-N Russian frequency tokens against the Kaikki (Wiktextract) Russian dictionary and reports:

- stressed-form coverage (the field that makes pronunciation correct),
- native audio coverage,
- usable English glosses,
- and the lemma-vs-inflected-form breakdown, which is the real risk: a raw OpenSubtitles frequency list is full of surface forms and function words, not dictionary headwords.

### Prerequisites

The frequency list downloads automatically (small). You need the Kaikki Russian dictionary once:

1. Go to https://kaikki.org/dictionary/Russian/
2. Download "postprocessed JSONL data for all word senses" (~770 MB). Direct file is usually `https://kaikki.org/dictionary/Russian/kaikki.org-dictionary-Russian.jsonl`. If that link 404s, take the current one from the page.
3. Save it anywhere.

Alternative that handles the download: `pip install kaikki-json`, then use `--use-kaikki-json`.

### Run

```bash
python spike_data_check.py --kaikki ./kaikki.org-dictionary-Russian.jsonl
python spike_data_check.py --kaikki ./russian.jsonl.gz --n 200
python spike_data_check.py --use-kaikki-json --n 100
```

Prints a summary and a verdict, and writes a per-word CSV to `./out/spike_report.csv`.

### Reading the result

- If stress coverage for lemmas is high (say 90%+), the foundation is solid and the rest of the build is safe.
- If many top tokens are inflected forms or function words, switch the ordering to a lemmatized frequency source (Russian National Corpus lemma frequencies, or lemmatize the list with `pymorphy3`) instead of the raw surface-form list. This is the most likely thing to change in the real pipeline.
- Partial native-audio coverage is expected; TTS fills the gaps per the design doc.

## Data sources and licenses (real pipeline)

- Frequency ordering: hermitdave/FrequencyWords (OpenSubtitles), attribute OpenSubtitles.
- Word data: English Wiktionary via Kaikki/Wiktextract, CC-BY-SA and GFDL, attribute Wiktionary. Supplement with OpenRussian for stress and ё coverage.
- Audio: Wiktionary/Commons bulk audio (per-file CC, capture attribution); TTS fallback.
- Example sentences: Tatoeba, CC-BY, attribute Tatoeba and contributors. Sentence audio via TTS (Tatoeba audio is mixed/non-commercial).
