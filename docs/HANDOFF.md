# Slonbelka — Project Status Handoff

_Last updated: July 8, 2026_

## Content pipeline — done, shipped to production

3160 Russian vocab words are live in Neon Postgres, frequency-ranked, in 64 levels (50 words/level).

Every word has:
- lemma, stressed form, translation(s), part of speech
- audio_url (2940 native Wiktionary pronunciations + 220 Azure TTS fallback, ~93% native)
- Audio normalized/trimmed, stored in Cloudflare R2 (`slonbelka-audio` bucket)

Cleanup done: old demo seed data merged into the real dataset, no duplicate items, no orphaned rows.

Dropped 313 words during the join (see `pipeline/out/levels/_dropped.json` if regenerated): mostly English-corpus contamination, garbled homoglyph Cyrillic, and character names from the underlying subtitle-based frequency list — correctly excluded. ~35 legitimate words (imperatives, diminutives like слушайте, поверь, немножко, домик, птичка) got wrongly dropped by an overly strict inflection filter — identified but not recovered yet. Low priority, easy manual patch whenever.

### Pipeline code

All in `pipeline/` in the repo:
```
lemmatize.py -> kaikki_join.py -> levels.py -> audio.py -> load_seed.py
```
Plus `cleanup_demo_items.py` and `merge_duplicate_items.py` (one-time cleanup, already run, safe to keep for future reference).

Full run instructions, env vars needed, and rerun semantics: `pipeline/CONTENT_PIPELINE.md`.

## Backend service wiring (Railway)

Per `docs/PRODUCTION_READINESS.md`:

- [x] Stripe webhooks — wired
- [x] VAPID push — wired
- [x] Resend (email) — wired
- [ ] Upstash Redis (rate limiting) — **in progress, currently working through this**
- [ ] Sentry (error tracking) — not started

## Not yet started

- **Example sentences (C2)** — needs its own Tatoeba-join stage, same shape as the vocab pipeline (join + TTS). Update: the join stage (`pipeline/sentences.py`) and the idempotent backend loader (`python -m app.load_sentences`) have since landed in the repo; generating and loading the real artifact is still pending.
- **Licensing review (E4)** — native audio license/attribution is generic right now ("verify per-file on the file page"), not per-file confirmed. Fine for personal use, needs real verification before any wider audience.

## For the next session

Content pipeline is done. Currently wiring Railway services — Stripe, VAPID, and Resend are done; Upstash Redis is in progress; Sentry is next.
