# Slonbelka: Path to a Paid, WaniKani-Level Product

A prioritized audit of what stands between the current build (Phases 0 to 3 plus the leech section, 117 backend tests, ~14-word demo seed) and a sellable product at WaniKani's quality bar. Grounded in the actual codebase.

## Bottom line

The code is the easy part and it is mostly done. The real distance to a paid product is:

1. Content. There is no real deck. WaniKani's value is thousands of hand-tuned items with mnemonics and professional audio. This is the dominant cost and it is a content and curriculum problem, not an engineering one.
2. Billing and entitlements. There is no payment system and no free/paid gating. Nothing to sell against right now.
3. Operational and legal weight. Charging money means uptime, support, security, refunds, taxes, and licensing compliance.

Everything below is sorted so that P0 is "cannot charge money without it," P1 is "needed to feel like WaniKani and retain users," and P2 is polish.

---

## P0: blockers to charging money

### Content and curriculum (the dominant cost)
- Run the spike, then build the real pipeline: frequency-ordered deck with stress, translations, part of speech, gender, aspect, audio, and example sentences. Until this exists there is no product.
- Lemmatize the ordering. The raw OpenSubtitles list is full of surface forms; order from a lemma frequency source or lemmatize with pymorphy3, or the deck will teach inflected junk.
- Curriculum design. Frequency order alone is not WaniKani. You need sensible level grouping, difficulty pacing, and probably a few themed early levels. This is editorial work.
- Mnemonics. WaniKani's mnemonics are arguably its single biggest differentiator. The current app only supports user-written ones. Matching WaniKani means authored mnemonics for every item, which is a large writing effort. Realistic option: AI-assisted generation with human review, but budget for the review.
- Content QA. Stress correctness, translation quality, and sense disambiguation all need a review pass. A wrong stress mark silently teaches the wrong pronunciation.

### Billing and entitlements
- Subscription billing with Stripe: products, prices, Checkout, Customer Portal, and webhook handling for subscription created, updated, canceled, and payment failed.
- A tier model and server-side entitlement enforcement. WaniKani gives the first levels free, then paywalls. Add a `subscription` model and gate lessons, reviews, and `maybe_level_up` past the free levels. Never trust the client for entitlement.
- Dunning and grace periods for failed payments, proration, trials, and a lifetime option if you want to mirror WaniKani's pricing.
- Invoices, receipts, and tax handling (Stripe Tax or equivalent for VAT and US sales tax).
- Cancellation and refund flows.

### Auth and security hardening
- Refresh tokens with rotation and revocation. The current single access token with a one-day expiry and no refresh is not acceptable for a paid app. Add logout-all and session listing.
- Email verification on signup and an email-based password reset. Neither exists.
- Rate limiting and brute-force protection on auth and write endpoints (slowapi plus Redis, or a gateway). None today.
- Reconsider the token in localStorage. It is XSS-exposed. Prefer httpOnly cookies plus CSRF protection, or at minimum a strict CSP. 
- Enforce a real JWT secret in production. The default `dev-secret-change-me` should hard-fail startup outside dev.
- Request size limits and stricter input validation.

### Infrastructure, migrations, deployment, CI
- Commit a real initial Alembic migration and stop relying on `create_all` in production. Guard the dev create_all to development only.
- CI/CD: GitHub Actions running lint, typecheck, backend tests, frontend build, and deploy on green.
- Deployment targets: frontend host, backend host, managed Postgres with backups and point-in-time recovery, and object storage plus CDN for audio.
- Background worker and queue for TTS generation, email sending, and scheduled notification dispatch (Arq, RQ, or Celery). None exists.
- Redis for rate limiting, sessions, and hot reads.
- Environment separation (dev, staging, prod) and real secrets management.
- Basic observability before launch: error tracking (Sentry), structured logging with request IDs, and a readiness probe that checks the database. The current `/health` is liveness only.

### Legal and licensing
- This is a real gate for a commercial product, not a formality. The deck is built from CC-BY-SA (Wiktionary/Wiktextract) and CC-BY (Tatoeba) sources. Commercial use is allowed but requires attribution, and CC-BY-SA share-alike can affect how your derived dictionary data must be licensed. Get this reviewed.
- Avoid the non-commercial Tatoeba audio entirely (already the plan). Confirm TTS provider terms permit storing and redistributing generated audio in a paid product. If using Forvo, confirm the commercial license.
- Terms of Service, Privacy Policy, and cookie consent.
- GDPR and CCPA: you dropped data export, but a paid product with EU or California users likely needs export and account deletion. Re-add both as account features.

---

## P1: to reach WaniKani-level quality and retention

### Offline and sync (Phase 4)
- Service worker, app-shell and audio caching, PWA manifest and icons, install prompts.
- IndexedDB review-event queue, offline reviews, and `POST /sync` replay. The schema is already designed append-only and idempotent for this; handle the unique-constraint race on `client_event_id` gracefully.

### Notifications and retention
- Web push (VAPID) for due reviews and an email digest. A daily-habit app lives or dies on reminders. This needs the background worker above.
- A scheduled job that computes who has reviews due and dispatches notifications respecting quiet hours.

### Audio and example sentences at scale
- Generate or fetch audio for the whole deck (native Wiktionary audio first, TTS fallback). Feed the stressed form so stress is correct. Consistency matters at the paid bar; WaniKani uses two consistent voices.
- Attach and TTS example sentences (Tatoeba text). Context sentences are a meaningful learning and quality signal.

### Item browser and detail pages
- WaniKani has rich per-item pages and a full browsable list. The app currently has no way to browse or search items or see per-item stats. Add an items list, search, and a detail page (readings, meaning, audio, sentences, your stats, your mnemonic).

### Settings, onboarding, vacation, extra-study UI
- A settings page. The `settings` JSON exists on the model but there is no UI for daily lesson cap, autoplay, keyboard layout, notifications, or account.
- A first-run onboarding flow.
- Vacation/freeze mode: `POST /settings/vacation` that pauses scheduling and shifts `available_at` forward on return. Designed, not built.
- A home entry point to launch extra study. The endpoint and the practice UI already exist; it just needs a button.

### Performance and scale
- `build_dashboard` loads every state and every review event into Python. Replace with aggregate SQL counts. This will not scale past a few hundred items per user.
- `get_reviews` does a per-item `db.get`, an N+1. Eager-load items with a join or `selectinload`.
- The lesson daily-cap check loads all lesson events into Python; make it a SQL count with a date filter.
- Add pagination to list endpoints (`/leeches`, and the future items list).
- Plan archival or partitioning for `review_events`, which grows unbounded.
- Confirm indexes on the hot paths: `user_item_state(user_id, available_at)` and `review_events(user_id, answered_at)`.

### Frontend testing
- There are zero frontend runtime tests today (only typecheck and build). Add Vitest component tests for the review and practice flows and grading display, and a Playwright end-to-end pass for register, lesson, review, and the offline-and-sync path.

---

## P2: competitive polish

- Override grade-then-commit split so override can waive a hard-wrong answer, not just a near-miss.
- End-of-lesson quiz gate before items enter the SRS, matching WaniKani's lesson flow.
- Session wrap-up screens with per-session accuracy and a streak nudge.
- Burned-item resurrection.
- Dark mode and a full accessibility pass (ARIA, keyboard navigation, screen-reader support, and a11y on the on-screen keyboard).
- A public read API, which is a WaniKani feature third-party tools rely on.
- Product analytics for the signup and retention funnel.
- Keyboard shortcuts, audio autoplay preferences, and reorder options.
- Verify the phonetic keyboard layout mapping and mobile key sizing.

---

## Concrete code improvements in the current codebase

File-level, actionable items a build agent can pick up:

- `app/config.py`: fail startup in production if `jwt_secret` is the default; mark secrets required; validate `settings` shape.
- `app/security.py`: add refresh-token issuance, rotation, and a revocation list; shorten access-token lifetime.
- `app/routers/auth.py`: add email verification, password reset, rate limiting, and logout-all.
- New `app/services/billing.py` and `app/routers/billing.py`: Stripe Checkout, Customer Portal, and webhooks; a `Subscription` model; an entitlement dependency that gates premium levels in `lessons`, `reviews`, and `maybe_level_up`.
- `app/services/dashboard.py`: replace the full in-Python aggregation with SQL `count`/`group by`; add a `frozen` field for vacation mode.
- `app/services/learning.py`: fix the `get_reviews` N+1 with eager loading; make the lesson-cap count a SQL query; add the grade-then-commit override path; add vacation skip and the unfreeze shift.
- `app/main.py`: guard `create_all` to dev only; add a readiness probe with a DB check; add structured logging and request IDs; API versioning under `/v1`.
- `app/migrations/`: generate and commit the initial migration; adopt a migration discipline.
- Consider opaque public IDs (UUID or hashids) instead of sequential integer PKs to avoid enumeration on a public API.
- Frontend `src/lib/api.ts`: handle 401 by refreshing the token; add retry with backoff and offline detection.
- Frontend: add error boundaries, consistent loading/empty/error states, and a token-refresh interceptor; move the token to an httpOnly cookie if you adopt that auth model.

---

## The honest content reality

To set expectations: WaniKani is built by a team and has had years to write mnemonics, record audio, and tune the curriculum. For Slonbelka as a solo or small effort, the engineering above is a few focused weeks. The content is the multi-month-to-multi-year part: ordering and grouping a few thousand words, writing or reviewing a mnemonic for each, securing consistent audio, and sense-checking translations and stress. If you want to charge money, that content quality, not the code, is what people will be paying for and judging.

A pragmatic middle path: launch a focused paid product on a smaller, extremely well-curated deck (for example the first 1,000 to 1,500 words done excellently, with AI-assisted then human-reviewed mnemonics and clean audio) rather than chasing WaniKani's full breadth on day one.

---

## Suggested sequence

1. Run the spike and build the content pipeline. Nothing else matters until the deck is real.
2. Add billing and entitlements with a free-levels paywall, plus the auth hardening and a real deployment with CI and migrations. This is the minimum to legally and safely take money.
3. Get the legal and licensing review done in parallel.
4. Offline and sync, plus notifications. These drive the daily habit that justifies a subscription.
5. Audio and example sentences at scale, item browser and detail pages, settings, and onboarding.
6. Performance hardening, frontend tests, and P2 polish.
