# Content pipeline

For v1 the deck is curated and frequency-ordered, built from open data. Before building any of that, run the spike to confirm the data foundation holds.

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
