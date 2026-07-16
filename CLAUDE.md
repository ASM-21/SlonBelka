# CLAUDE.md

Working guide for Claude Code (and humans) contributing to Slonbelka. Read this first. Keep it accurate as the project changes.

Slonbelka is a WaniKani-style spaced-repetition app for learning Russian vocabulary with real pronunciation audio. FastAPI + SQLAlchemy + Postgres backend, Vite + React + TypeScript + Tailwind frontend, PWA with offline reviews.

## Golden rules

1. Tests must pass before any change is considered done. Backend and frontend both. See commands below.
2. Content is upserted on `external_id`, never truncated and reinserted. User progress references items by row id, so reassigning ids orphans every user's state. Load and update all content through `app/content/importer.py::upsert_items`.
3. Every schema change needs an Alembic migration, verified on a fresh chain before commit. Do not rely on `create_all` for real deployments (it is a dev convenience only).
4. The SRS engine (`app/srs/engine.py`) is correctness-critical and pure. Do not add I/O or side effects to it. Change it only with matching tests.
5. Prose in docs, comments, and commit messages uses no em dashes.

## Quickstart

Backend, zero-config on sqlite:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed_dev            # upserts ~14 demo words so lessons exist
uvicorn app.main:app --reload     # http://localhost:8000/docs
```

Frontend:
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Full stack on Postgres:
```bash
docker compose up --build         # backend :8000, Postgres :5432
```

## Test commands (all must be green)

Backend:
```bash
cd backend && rm -f *.db && python -m pytest -q
```

Frontend (tests, plus typecheck and build):
```bash
cd frontend && npx tsc --noEmit && npm run build && npx vitest run
```

Pipeline:
```bash
cd pipeline && python -m pytest -q
```

CI (`.github/workflows/ci.yml`) runs all of the above plus a fresh-chain migration check and a Playwright browser smoke test (`e2e/`, standalone package installed at CI time, no lockfile) on every push and PR to main. CodeQL and Dependabot run alongside.

## Architecture map

Backend (`backend/app/`):
- `main.py` app wiring, Sentry init (only when `SENTRY_DSN` is set), body-size middleware, CORS, router includes, `/health` (liveness only) and `/health/ready` (checks the database; point load balancers here). `create_all` runs on startup only when environment is not prod.
- `config.py` settings from env or `.env` (pydantic-settings). Prod refuses to boot with the default JWT secret. Integrations no-op when their vars are unset: `sentry_dsn`, `redis_url`, `resend_api_key`, `vapid_public_key`/`vapid_private_key`, `internal_task_token`.
- `db.py` engine, `SessionLocal`, `Base`, `get_db`.
- `middleware.py` request body size cap (`max_body_bytes`, 64 KB default, 413 over it).
- `models.py` SQLAlchemy models. `schemas.py` Pydantic request/response models; string inputs carry max_length caps.
- `security.py` Argon2 hashing, JWT, token generation and hashing.
- `grading.py` answer grading: Russian normalization (stress and ё/е insensitive), English normalization, Levenshtein tolerance.
- `timeutil.py` `utcnow()` and `aware()`. Always use these, not naive datetimes (sqlite drops tz info).
- `srs/engine.py` pure SRS: stages, intervals, `apply_review`, `band`, leech scoring.
- `content/` stable identity and content import: `slugs.py` (`default_external_id`), `importer.py` (`validate_item`, `upsert_items`), `sentences.py` (`upsert_sentences`, keyed on `(item, source_ref)`, same never-truncate rule).
- `services/` business logic: learning, study, dashboard (progress plus `build_forecast`), entitlements, billing, email (Resend when configured, dev outbox otherwise; verification, reset, and the weekly `send_weekly_digests`), ratelimit (Redis when configured, in-memory otherwise), push (pywebpush delivery, the review-reminder sweep, reminder opt-out and timezone-aware quiet hours), auth, account (settings, vacation, data export, deletion), synonyms, stats, metrics (in-process request counters and latency buckets, fed by the request-log middleware).
- `routers/` HTTP endpoints, one module per area: auth, lessons, reviews (`/reviews/forecast`, `/reviews/undo` to correct a typo on the last answer), dashboard, study, billing, settings, items, push, stats, account (`/account/export`, `/account/delete`), internal (cron-triggered `/internal/push/run` and `/internal/email/digest` plus the `/internal/metrics` snapshot, all behind `X-Internal-Token`), client_errors (`/client-errors`, forwards uncaught frontend errors to Sentry).
- `migrations/` Alembic. `seed_dev.py` demo content (uses the importer). `load_sentences.py` CLI that loads a sentence artifact. `tests/` pytest suite, `conftest.py` fixtures.

Reserved keys in the `User.settings` JSON (do not reuse for user preferences): `vacation_started_at` (freeze mode), `last_reminder_sent_at` (push reminder cooldown), `onboarded` (first-run walkthrough done).

Frontend (`frontend/src/`):
- `lib/` `api.ts` (typed client with refresh-token auto-refresh), `grading.ts` (TS port of server grading, kept byte-identical for the client-side lesson quiz), `offlineQueue.ts` (IndexedDB: review queue, lesson cache, lesson completion queue), `sync.ts` (drains the review and lesson queues), `push.ts` (VAPID subscribe), `useFetch.ts` (loading/error/retry hook for all data pages), `shuffle.ts` (Fisher-Yates plus pair spreading for session queues), `typing.ts` (physical-keyboard Latin to Cyrillic mapping), `labels.ts` (shared UI names: Tricky words, band names, level bands), `urlParams.ts` (parses entry query params on the root URL: billing/verify/reset/goto), `theme.ts` (light/dark/system preference, reflected onto `html[data-theme]`), `useOnline.ts` (connectivity hook), `errorReporting.ts` (forwards uncaught errors to `POST /client-errors`).
- `components/` one per screen: App (view switch), ErrorBoundary (crash fallback), OfflineBanner, AuthScreen, Onboarding (first-run walkthrough), Home, LessonSession, ReviewSession, LeechesPage, PracticeSession, CyrillicKeyboard, ProductionInput (shared Russian answer input, physical plus on-screen), ItemInfoPanel (after-answer word details plus audio/sentence attribution), ItemBrowser, SettingsPage, UpgradePage, ExtraStudyPage, BurnedPage, StatsPage (includes the review forecast), SessionSummary, LegalPage (renders bundled legal markdown), ui (PageHeader, MascotPlaceholder).
- `legal/` bundled copies of the three user-facing docs from `docs/legal/`; keep them in sync when the source changes.
- `test/` vitest setup (`setup.ts`) and `dom.tsx`, a small dependency-free DOM harness (render, text/button/field queries, act-wrapped events) that the component tests use instead of Testing Library. Component tests live next to their component as `*.test.tsx`.
- `public/` service worker (`sw.js`), web manifest, icon.

## Migrations workflow (verified)

```bash
cd backend
export DATABASE_URL="sqlite:///./_mig.db"
rm -f _mig.db
alembic upgrade head                                   # build schema at current head
alembic revision --autogenerate -m "short description" # generate from model changes
# review the generated file, then verify a fresh chain applies cleanly:
rm -f _mig.db && alembic upgrade head
rm -f _mig.db
unset DATABASE_URL
```
Prefer migrations that are safe on populated tables: add a column nullable, backfill, then enforce NOT NULL using `op.batch_alter_table` (works on both sqlite and Postgres). See `migrations/versions/3284f0181e9e_item_external_id_stable_identity.py` for the pattern.

## How to do common tasks

Add an endpoint: add the Pydantic models to `schemas.py`, the logic to the relevant `services/` module, and the route to the matching `routers/` module. Add tests under `tests/`.

Add a model field: edit `models.py`, generate and verify a migration, update any affected schemas and services, add or update tests.

Add or update content: build a list of record dicts and call `upsert_items(db, records)`. Required fields are `lemma`, `stressed_form`, `translation_primary`, `level`; see the content record schema in `docs/PRODUCTION_READINESS.md`. Never write items any other way.

## Locked decisions

- Item identity: one item per `external_id`. The default key is `{pos}:{lemma}:{sense}`. Homographs that need separate study get distinct sense indices, decided at import time. User state binds to items by row id, kept stable across imports by upserting on `external_id`.
- Audio policy: native pronunciation first for headwords; TTS is a labeled fallback and is acceptable for example sentences but not the preferred source for headwords. Decide per word at content-build time and record the source and license on the audio asset.

## Gotchas

- Tests use `create_all` and the dev seed, not migrations, so a model change alone will pass tests but still needs a migration for real databases.
- `GET /lessons` returns at most the daily lesson cap, so a test that needs many items should query the DB directly rather than through that endpoint.
- Test fixtures that mutate state through `SessionLocal` must `db.commit()`, or the change rolls back and the assertion fails.
- The client-side lesson quiz grades locally with `frontend/src/lib/grading.ts`; if you change server grading in `backend/app/grading.py`, keep the TS port in sync.
- Registration requires `accepted_terms: true` (400 otherwise); test helpers that register must send it.
- The legal docs exist twice: `docs/legal/` is the source, `frontend/src/legal/` is the bundled copy the app renders. Change both together. Placeholders ([SUPPORT EMAIL], [DATE], [X days]) still need filling before publishing.
- Fonts are self-hosted via fontsource because `sw.js` never caches cross-origin requests; a Google Fonts link would break offline.
- The frontend has no path routing. Anything arriving from outside (Stripe checkout returns, email verification and reset links) must be query params on the root URL: `?billing=success|cancel`, `?verify=<token>`, `?reset=<token>`. App.tsx parses them once on mount (`lib/urlParams.ts`) and cleans the URL. Do not add links to paths like `/billing/success`; they 404 on the static deploy.
- `BILLING_SUCCESS_URL`/`BILLING_CANCEL_URL` and the email links in `services/email.py` must stay in the query-param shape above.
