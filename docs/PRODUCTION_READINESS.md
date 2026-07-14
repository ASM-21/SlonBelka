# Production readiness and build guide

The plan to take Slonbelka from a tested scaffold to a shippable product. Written so each task can be picked up independently by Claude Code. Work top to bottom: later phases assume earlier ones are done.

## Status snapshot

Done and tested:
- Full app loop: register, verify, lessons, reviews, dashboard, leeches, extra study, item browser, user synonyms, burned-item resurrection, stats, settings, vacation mode, offline reviews with sync.
- SRS engine, answer grading (Russian stress and ё/е insensitive), auth with refresh-token rotation, in-memory rate limiting, Stripe billing scaffold with entitlements.
- Stable item identity: items carry a unique `external_id`; all content loads through `app/content/importer.py::upsert_items`, which upserts on that key and never reassigns row ids. Migration `3284f0181e9e` adds it safely on empty and populated databases.
- Backend and frontend test suites plus pipeline tests, all run in CI on every push and PR to main; six Alembic migrations.
- Infrastructure code: Sentry error tracking (D4), Redis-backed rate limiting (D1), real email through Resend (D2), web push sender with a cron-triggered sweep (D3), request body size limits and input length caps, CI (D5).
- Launch code: account deletion and data export (E1), Stripe checkout return handling in the SPA (query params on the root URL).
- Example sentences (C2) code: Tatoeba join stage in `pipeline/sentences.py`, idempotent loader `app/content/sentences.py` keyed on `(item, source_ref)`.
All of the above no-op safely in dev and tests when their env vars are unset.

Not built yet, in priority order:
- Real content in this repo: only ~14 demo words seeded here. No mnemonics; example-sentence content still needs the Tatoeba artifact generated and loaded.
- Audio: model fields and the source/license/attribution table exist, but this repo has no ingestion, normalization, storage, or serving code.
- Launch requirements: no onboarding, email verification is off by default.

## Two decisions to lock before writing pipeline code

Everything downstream depends on these. Write the choice into `CLAUDE.md` once made.

Decision 1, item sense-splitting. One item per lemma, or per lemma plus sense. The default key is `{pos}:{lemma}:{sense}`. Recommendation: default to one item per lemma+pos for v1, and only split a homograph into separate senses when the two meanings are genuinely different words to learn. Splitting later is a content migration, not a schema change, because the importer is keyed on `external_id`.

Decision 2, native audio versus TTS. Recommendation: native pronunciation first for every headword; where native audio is missing, either use a clearly labeled TTS fallback or exclude the word from v1 rather than ship a silent or robotic headword. TTS is fine for example sentences. Record the source and license on every audio asset. Get the real native-coverage number from the content spike before committing to deck size.

## Phase A: Content foundation

### A1. Stable item identity — DONE
Items have a unique `external_id`; content upserts on it; migration verified on fresh and populated databases; importer has tests. Nothing to do; do not regress it.

### A2. Run the content spike against real data
Goal: real coverage numbers for stress marks, glosses, part of speech, and native audio across the Russian frequency list, so deck scope is a decision and not a guess.
Why: scope, lemmatization need, and the audio fallback policy all depend on these numbers.
Where: `pipeline/spike_data_check.py`, `pipeline/README.md`.
Steps:
1. Download the Kaikki Russian dictionary JSONL and a frequency list (hermitdave FrequencyWords ru is CC-BY-SA) as described in `pipeline/README.md`.
2. Run the spike over the real files.
3. Record, for the top N frequency ranks: percent with a usable gloss, percent with stress information, percent with an IPA field, and percent with a native audio reference. Break it down before and after lemmatization.
Acceptance: a short written coverage report checked into `pipeline/`, with the numbers that set v1 scope and the audio fallback rate.
Commands:
```bash
cd pipeline && python spike_data_check.py --kaikki /path/to/kaikki.org-dictionary-Russian.jsonl
```

### A3. Build the content pipeline
Goal: a repeatable, idempotent pipeline that turns raw sources into validated content records and loads them through the importer.
Why: the seed is a demo; the real deck needs lemmatization, curation, level assignment, and validation, produced the same way every time.
Where: new module under `pipeline/`, plus `app/content/importer.py` (already the load primitive).
Steps:
1. Lemmatize the frequency list (pymorphy3 or equivalent) and collapse inflected forms; function words dominate the raw top ranks, so lemmatization is required, not optional.
2. Join against the Kaikki dump for gloss, part of speech, stress, and IPA.
3. Apply the sense-splitting decision to assign `external_id` per record.
4. Assign `level` and `frequency_rank` from a curated ordering (see C1).
5. Emit content records as a versioned artifact (for example JSON per level), then load with `upsert_items`. The build must fail if `validate_item` reports any problem.
Acceptance: running the pipeline twice produces zero-diff database state (idempotent); an intentionally malformed record aborts the load with a clear error; item ids are stable across reruns.
Commands: the loader should call `upsert_items(db, records)` and print created/updated counts.

## Phase B: Audio pipeline

### B1. Audio sourcing and licensing
Goal: a per-word decision of native versus TTS, with source and license captured.
Why: native pronunciation is the product; licensing mistakes are expensive to unwind.
Where: `pipeline/` audio module; the `AudioAsset` model already has source, license, and attribution fields.
Steps:
1. For each headword, look up native audio (Wiktionary and Wikimedia Commons are CC but require per-file attribution). Forvo is not license-clean for redistribution; do not scrape it.
2. Where native audio is missing, apply the Decision 2 policy: labeled TTS fallback (Azure has usable Russian voices; `azure_speech_*` config fields exist) or exclude from v1.
3. Use TTS, not Tatoeba audio, for example sentences.
4. Record source, license, and attribution on every asset.
Acceptance: every shipped headword has an audio asset with a recorded source and license, and native-versus-TTS is explicit per word.

### B2. Audio processing and storage
Goal: normalized audio served fast, offline-cacheable.
Where: `pipeline/` audio module, plus a small storage abstraction in the backend.
Steps:
1. Normalize loudness to a consistent target, trim leading and trailing silence, and transcode to one or two web formats.
2. Store in object storage behind a CDN. Add a storage backend abstraction so dev uses local disk and prod uses S3 or R2; keep credentials in config.
3. Set each item's `audio_url` to the served URL during content load.
4. Confirm the service worker caches audio for offline use, with a sane cache-size bound.
Acceptance: headword audio plays in the app from the CDN, is loudness-consistent, and is available offline after first play.

## Phase C: Content population

### C1. Scope and level design
Goal: a curated, ordered deck for v1.
Why: the ordering is the product; a large unordered list is not.
Steps: pick a tight v1 size (1000 to 1500 words is a reasonable target), order by a blend of frequency and teachability, and assign words to levels with a consistent words-per-level count. The SRS engine already gates level unlocks; this task is the curriculum design that fills it.
Acceptance: every word has a level and a place in the ordering; level sizes are consistent; the free tier boundary (`free_level_limit`) lands somewhere sensible.

### C2. Example sentences — CODE DONE, content load pending
Goal: one or two example sentences per word.
Where: `ExampleSentence` model, `pipeline/sentences.py` (Tatoeba join), `app/content/sentences.py::upsert_sentences` (idempotent loader keyed on `(item, source_ref)`), `python -m app.load_sentences`.
Remaining: download the Tatoeba exports, generate and review the artifact, load it into production; sentence TTS audio is a later stage (`audio_url` stays NULL until then). Attribution string ships in the artifact.
Acceptance: each word has at least one example with translation and audio, attribution recorded.

### C3. Mnemonics
Goal: memory hooks for meaning and, where useful, reading.
Why, and the honest tradeoff: mnemonics are the largest hidden cost and a real differentiator. Good ones for 1500 words are months of writing. Generic or weak mnemonics are worse than none. Options: write your own over time, AI-assist with heavy human editing, or launch without full mnemonics and lean on audio and examples. Recommendation: do not block launch on complete mnemonics; ship the ones that are good and add the rest as an ongoing content stream.
Where: `Mnemonic` model; the frontend already renders and lets a user edit their own.
Acceptance: whatever ships is genuinely helpful; nothing filler is shipped just to fill the field.

## Phase D: Infrastructure and ops

### D1. Rate limiting on Redis — DONE (code)
Where: `app/services/ratelimit.py`. With `REDIS_URL` set the limiter is a Redis fixed window (atomic Lua INCR+PEXPIRE) shared across workers, failing open on Redis errors; without it the in-memory window still serves dev and tests.
Remaining: set `REDIS_URL` on the host and confirm 429s under load.

### D2. Email provider — DONE (code)
Where: `app/services/email.py`. With `RESEND_API_KEY` set, mail goes through the Resend API (`EMAIL_FROM` configurable); failures are logged, never raised. The dev outbox stays for tests. Links use query params on the SPA root (`/?verify=`, `/?reset=`).
Remaining: set the key, smoke-test delivery, verify a sending domain later.

### D3. Push sender and scheduler — DONE (code)
Where: `app/services/push.py` (pywebpush, VAPID keys in config, dead subscriptions pruned, 6h per-user cooldown in the settings JSON), triggered by `POST /internal/push/run` with `X-INTERNAL-TOKEN`, fired by `.github/workflows/push-reminders.yml` every 30 minutes.
Remaining: set the VAPID keys, `INTERNAL_TASK_TOKEN`, and the GitHub secrets; confirm delivery on a real device.

### D4. Observability — DONE (code)
Where: `app/main.py` initializes Sentry when `SENTRY_DSN` is set (environment tag, PII off).
Remaining: set the DSN and trigger one test error to confirm capture. Structured request logging and metrics are still open.

### D5. CI — DONE
Where: `.github/workflows/ci.yml`. Backend pytest plus pipeline tests, frontend typecheck, build, and vitest, and a fresh-chain migration check, on every push and PR to main.
Remaining: optionally require the checks via branch protection.

### D6. Deploy
Goal: a running production environment.
Steps: containerized backend, managed Postgres, object storage, CDN, and the frontend served as static assets. A Dockerfile and compose file already exist as a starting point. Set `environment=prod` (which enforces the strong-secret check) and provide all required env vars.
Acceptance: the app is reachable, migrations run on deploy, and audio serves from the CDN.

## Phase E: Launch readiness

### E1. Account deletion and data export — DONE
Where: `GET /account/export` (portable JSON keyed by item `external_id`) and `POST /account/delete` (password re-entry, best-effort Stripe cancel, removes every dependent row and revokes all sessions), surfaced in Settings with a two-step confirm.
Acceptance met: deletion removes all user data and cannot be triggered accidentally; export returns the user's data in a portable format.

### E2. Enforce email verification for paid features — DONE (code)
Where: `POST /billing/checkout` returns 403 for unverified users when `require_email_verification` is on; existing subscribers keep access. The home screen shows a verify nudge with a resend button.
Remaining: set `REQUIRE_EMAIL_VERIFICATION=true` on the host when ready to enforce (off by default so the demo flow stays frictionless).

### E3. Onboarding — DONE
Where: `frontend/src/components/Onboarding.tsx`, a three-slide first-run walkthrough (what the app is, how the SRS intervals work, a hands-on Cyrillic input try) shown once per account via a new `onboarded` settings flag. Entry flows with their own context (Stripe return, reset link) skip it.
Acceptance met: a new user reaches their first lesson understanding how to input answers.

### E4. Legal and licensing review — DONE (code), audit pending
Where: item detail surfaces per-file audio source/license/attribution from the `audio_assets` table (or a Generated (TTS) label); example sentences carry a Tatoeba CC BY line. `docs/legal/CONTENT_ATTRIBUTION.md` covers all sources and has an owner pre-launch review checklist.
Remaining: the owner audit itself (confirm each Commons file's license tag and load attribution rows), plus a lawyer's share-alike confirmation before a paid launch.

### Other launch polish landed this iteration
- Review forecast (`GET /reviews/forecast`) with 24-hour and weekly charts on the stats page.
- Offline lessons: lesson content is cached in IndexedDB and completions queue for sync, mirroring the offline reviews path.
- Mobile PWA polish: real PNG icons, iOS apple-touch-icon and status-bar meta, reminder deep-link into reviews, app icon badge for due count.
- Answer feedback: the continue button turns green or red per result in every session.
- Infra: rate limits on sync and export, structured request logging, a Playwright browser smoke test in CI, plus CodeQL and Dependabot.
- Reminder controls: a per-user opt-out and timezone-aware quiet hours the push sweep respects, plus a Show the welcome tour again option.
- Weekly email digest (`POST /internal/email/digest`, Monday cron): a short progress email to opted-in verified users, reusing the Resend path.
- Past-due dunning: a home banner links to the billing portal when the subscription is `past_due`.
- Dark mode: light/dark/system theme with a Settings selector, plus an accessibility pass (accessible names, live-region feedback, progressbar roles, real switch toggles).
- Robustness: a React error boundary with a reload fallback, uncaught client errors forwarded to Sentry via `POST /client-errors`, `prefers-reduced-motion` support, and an offline indicator banner.
- Session controls: a `session_size` setting caps words per review session; a Typo? Mark correct action (`POST /reviews/undo`) flips the last wrong answer to correct within a short window.

## Reference

### Content record schema
Fields accepted by `upsert_items`. Required: `lemma`, `stressed_form`, `translation_primary`, `level`.
- `external_id` (string): stable key. If omitted, derived as `{pos}:{lemma}:{sense}`. Set it explicitly from the pipeline when splitting senses.
- `type` (string): `vocab` by default.
- `level` (int, >= 1): required.
- `lemma` (string): dictionary form. Required.
- `stressed_form` (string): display form with stress as combining acute U+0301 after the stressed vowel. Required.
- `translation_primary` (string): the canonical gloss. Required.
- `translations` (list of strings): the accept-list for meaning answers.
- `part_of_speech`, `gender`, `aspect`, `ipa` (strings, optional).
- `audio_url` (string, optional): set during audio load.
- `frequency_rank` (int, optional).
- `notes` (string, optional).
An invalid record aborts the whole batch; nothing is written.

### Environment variables
Defaults are dev-friendly; set real values for production.
- `ENVIRONMENT`: `dev`, `test`, or `prod`. In `prod` the app refuses to start with the default JWT secret.
- `DATABASE_URL`: sqlite by default; a Postgres URL in production.
- `JWT_SECRET`: required strong value in production. `JWT_ALGORITHM`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS` have sane defaults.
- `REQUIRE_EMAIL_VERIFICATION`: off by default; on in production for paid features.
- `FREE_LEVEL_LIMIT`: levels at or below this are free.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_PRICE_LIFETIME`, `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`: billing. The success and cancel URLs must be query params on the SPA root (for example `https://app.example/?billing=success`) because the frontend has no path routing.
- `FRONTEND_ORIGIN`: CORS origin for the frontend, also the base for email links.
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: TTS.
- `SENTRY_DSN`: error tracking; unset means Sentry is off.
- `REDIS_URL`: cross-process rate limiting; unset means in-memory.
- `RESEND_API_KEY`, `EMAIL_FROM`: real email; unset means the dev outbox.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: web push delivery; both keys unset means push is off. The frontend needs `VITE_VAPID_PUBLIC_KEY` at build time.
- `INTERNAL_TASK_TOKEN`: shared secret for `/internal/*` cron endpoints; unset means they answer 503.
- `MAX_BODY_BYTES`: request body cap, 64 KB default.
- Still not in config (owner-side only): object storage credentials and bucket, CDN base URL.

### Audio pipeline spec (summary)
Native first for headwords, TTS labeled fallback, TTS for sentences. Normalize loudness, trim silence, transcode to web formats, store in object storage behind a CDN, record source and license per asset, cache for offline within a size bound.

### Licensing notes
- hermitdave FrequencyWords (frequency list): CC-BY-SA, attribution and share-alike.
- Wiktionary and Wikimedia Commons audio: CC, per-file attribution required.
- Tatoeba sentences: CC-BY, attribution required. Do not use Tatoeba audio for headwords; generate sentence audio with TTS.
- Forvo: not license-clean for redistribution; do not scrape.
Keep an attribution record and surface it in-app wherever a license requires it.
