# Slonbelka

A WaniKani-style spaced-repetition app for learning Russian vocabulary, with real pronunciation audio. Type-what-you-hear reviews, an SRS that schedules each word for you, an on-screen Cyrillic keyboard, and offline reviews that sync when you reconnect.

The app loop is built and tested end to end. The remaining work to reach a public product is content, audio, and infrastructure, laid out as executable tasks in [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md). Contributor guide (and Claude Code guide) is [`CLAUDE.md`](CLAUDE.md).

## Features

- Lessons and reviews on a real SRS engine (apprentice through burned), with per-item scheduling.
- Answer grading tuned for Russian: stress and ё/е insensitive, with typo tolerance, plus per-user synonyms so a correct-but-unlisted answer stops being marked wrong.
- On-screen Cyrillic keyboard (JCUKEN and phonetic layouts).
- Leeches, extra study, and no-stakes practice modes.
- Burned-item resurrection to bring a retired word back for another pass.
- Progress dashboard and a stats page (reviews over time, accuracy, streaks, SRS distribution).
- End-of-session summaries for lessons and reviews.
- Offline reviews: answers queue locally and sync on reconnect (PWA with a service worker).
- Accounts with refresh-token auth, email verification and reset, rate limiting, and a Stripe billing scaffold with a free tier by level.

## Tech stack

- Backend: FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, Postgres (sqlite for zero-config dev).
- Frontend: Vite, React, TypeScript, Tailwind.
- Auth: Argon2 password hashing, JWT access and refresh tokens.
- Tests: pytest (174) and Vitest (26).

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

## Tests

```bash
cd backend && rm -f *.db && python -m pytest -q
cd frontend && npx tsc --noEmit && npm run build && npx vitest run
```

## Project structure

```
backend/          FastAPI app
  app/
    srs/engine.py     pure SRS engine (correctness-critical)
    grading.py        Russian and English answer grading
    content/          stable identity and content import (upsert by external_id)
    models.py         SQLAlchemy models
    schemas.py        Pydantic models
    services/         business logic
    routers/          HTTP endpoints
    migrations/       Alembic
    seed_dev.py       demo content (uses the importer)
  tests/
frontend/         Vite + React + TypeScript
  src/
    lib/              api client, grading port, offline queue, sync, push
    components/       one per screen
  public/             service worker, manifest
pipeline/         content-pipeline spike and, in progress, the real pipeline
docs/             design doc, status, and the production-readiness build guide
```

## Content and identity

All vocabulary is loaded through `app/content/importer.py::upsert_items`, which upserts on a stable `external_id`. User progress references items by row id, so content is refreshed in place and never truncated and reinserted. This is the one invariant to preserve when adding content; see `CLAUDE.md`.

## Status and roadmap

Built and tested: the full lessons-and-reviews loop, accounts, billing scaffold, offline sync, and stable item identity. Not yet built: the real word deck, pronunciation audio, and production infrastructure (shared rate limiting, email and push delivery, object storage and CDN, error tracking, CI, deploy). The sequenced plan with per-task acceptance criteria is in [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md).

## License

Not yet chosen. Note that some planned content sources (frequency lists, Wiktionary and Commons audio, Tatoeba sentences) carry attribution and share-alike terms; see the licensing notes in the build guide.
