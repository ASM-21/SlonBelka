# Content + audio pipeline

Implements A3 and Phase B from `docs/PRODUCTION_READINESS.md`. Five stages,
each reading the previous stage's artifact from `./out/` and writing its own,
so you can inspect or rerun any one of them without redoing the rest.

```
lemmatize.py -> out/lemmas.json
kaikki_join.py -> out/joined.json
levels.py -> out/levels/level_XXX.json
audio.py -> fills audio_url in out/levels/level_XXX.json, writes out/audio_assets.json
load_seed.py -> validates, then upserts into the database
```

## 0. One-time setup

```bash
cd pipeline
pip install -r requirements.txt --break-system-packages   # or use a venv
```

You also need ffmpeg on PATH (pydub shells out to it for normalize/trim/transcode):
`apt install ffmpeg` / `brew install ffmpeg` / on Windows grab a static build and add
it to PATH.

Download the Kaikki Russian dictionary once (see `pipeline/README.md` for the link,
~770 MB). The frequency list downloads automatically.

Env vars (audio + load stages):
```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...          # e.g. eastus
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=https://...   # whatever serves the bucket publicly (custom domain or r2.dev)
DATABASE_URL=...                 # only needed for load_seed.py; defaults to backend's sqlite dev db
```

## 1. Run it

```bash
python lemmatize.py --n 1600
python kaikki_join.py --kaikki /path/to/kaikki.org-dictionary-Russian.jsonl
python levels.py --level-size 25 --max-words 1500
python audio.py
python load_seed.py
```

Each command prints a summary. `levels.py` also writes
`out/levels/_dropped.json`, the audit trail of every lemma that didn't make
the cut and why (not in Kaikki, no stress mark, no gloss, or the best Kaikki
entry was an inflected form rather than a lemma).

## 2. Rerunning safely

Every stage is idempotent and every artifact is inspectable JSON. Re-running
`load_seed.py` upserts on `external_id`, so existing rows keep their id (and
user progress) — see `app/content/importer.py`. Re-running an earlier stage
regenerates its output file from scratch; downstream stages then need
rerunning too since level files get overwritten.

`--validate-only` on `load_seed.py` checks the seed-validation gate (every
record needs `lemma`, `stressed_form`, `translation_primary`, `level`,
`part_of_speech`, and `audio_url`) without writing to the database.

## 3. What to expect from real data

The `pipeline/README.md` spike (run against the real Kaikki file, not yet
done as of this pipeline being built) is still the fastest way to get
coverage numbers before committing to a deck size. Rough expectations, per
the design doc and general Wiktionary coverage patterns:

- Lemmatization will collapse the raw frequency list hard — expect roughly
  half the raw top-N tokens to survive as unique lemmas, since Russian's
  case/conjugation system means many surface forms map to one dictionary word.
- Not every lemma will be in Kaikki, and not every Kaikki entry will carry a
  stress mark or native audio. `levels.py` drops anything missing a stress
  mark or gloss outright — no item ships without those two, per Decision 2
  and the design doc's seed-validation gate.
- Native audio coverage will be partial. `audio.py` synthesizes TTS for the
  rest and marks the AudioAsset row `source: "tts"`, so nothing is silent
  and nothing is mislabeled as native.

If native coverage or stress coverage comes back much worse than expected
once you run this on the real file, that's the signal from A2 (run the spike
first, or just read `out/levels/_dropped.json` after a real run) to bring in
OpenRussian as a second stress/ё source or a lemmatized RNC frequency list
instead of tightening the drop rules further.

## 4. What's still open after this

- **C2, example sentences**: not built. `ExampleSentence` needs its own
  Tatoeba-join stage; same shape as this pipeline (source, license,
  TTS-generated sentence audio) but not written yet.
- **C3, mnemonics**: intentionally out of scope per the design doc's
  recommendation — don't block launch on it.
- **Sense-splitting**: this pipeline defaults to one item per lemma
  (Decision 1's recommendation), `external_id = {pos}:{lemma}:0`. Splitting
  a homograph into two senses later just means setting a different
  `external_id` explicitly for that record; it's a content change, not a
  schema or importer change.
- **Licensing review (E4)**: `audio.py` records what Kaikki gives us for
  license/attribution, which for native audio is generic ("verify per-file
  on the file page") rather than a confirmed per-file license. Real
  per-file verification against Wikimedia Commons is still a manual pass
  before shipping natively-sourced audio at scale.
