# Slonbelka: Russian SRS Trainer (Design Doc, v1)

> "Slonbelka" is a coined name from slon (слон, elephant) and belka (белка, squirrel), the two animals best known for memory: the elephant never forgets, the squirrel remembers every cache. Fitting for a spaced-repetition app, and the mascot is a blend of the two. (Earlier working titles: Slon, and before that Slovo.)

**Purpose of this doc:** a complete, build-ready spec for a personal WaniKani-style spaced-repetition app for learning Russian vocabulary, with correct pronunciation audio. It is written to be handed to a separate build agent (Claude Code) and committed to a GitHub repo. Scope below is v1.

**One-paragraph summary:** A web app (installable PWA) that teaches a curated, frequency-ordered Russian vocabulary deck through gated levels and an SRS review schedule modeled on WaniKani. Each word carries a stress-marked form, an English translation, grammatical metadata, native or synthesized audio, and example sentences. Reviews are typed with self-grading and a manual override. A built-in on-screen Cyrillic keyboard handles input and doubles as an alphabet reference. Progress is saved server-side behind real accounts and syncs across devices, with offline review support. Leeches get a dedicated section.

---

## 1. Goals and non-goals

**Goals**
- Curated, well-ordered Russian deck (the order is the product, like WaniKani).
- WaniKani-style SRS and level gating, loosened slightly for the first few levels.
- Correct pronunciation: play native audio where available, TTS otherwise.
- Typed reviews with self-grading plus a correct-answer override.
- On-screen Cyrillic keyboard that also works as a visual alphabet reference.
- Real logins, reliable server-side progress, cross-device sync, offline reviews.
- Dedicated leech section.

**Non-goals (v1)**
- Grammar drilling: cases, declension, conjugation. Dictionary forms only.
- Multiple languages or multiple curated decks.
- Community features, sharing, social.
- Native mobile apps (the PWA covers mobile).
- Data export (intentionally dropped in favor of solid accounts and persistence).
- Pronunciation scoring or microphone input (audio is playback only).
- Placement or skip-ahead testing (everyone starts at level 1).

**Primary user:** a single learner (the author), but the data model is multi-user from day one so accounts can be added later without a rewrite.

---

## 2. Core concepts

- **Item:** the atomic learnable unit. Two types in v1: `vocab` (a Russian word) and `kana` (a Cyrillic letter, used only in the optional alphabet primer). Item type naming kept generic for extension.
- **Level:** an ordered bucket of vocab items (target 25 to 30 words per level, configurable). Levels gate progression.
- **Lesson:** the first introduction of an item, shown at the learner's pace. Completing a lesson moves the item into the review queue.
- **Review:** a scheduled recall test of an item. Correct answers advance the SRS stage; wrong answers drop it.
- **SRS stage:** where an item sits on the 9-stage memory ladder (see section 3).
- **Guru:** SRS stage 5, the point at which an item counts as "learned" for level-up purposes.

---

## 3. SRS engine

Nine stages across five groups, modeled on WaniKani. "Guru" is reached at stage 5.

| Stage | Name | Interval to next (standard) | Interval (levels 1 to 3, accelerated) |
|------:|------|-----------------------------|---------------------------------------|
| 1 | Apprentice 1 | 4 hours | 2 hours |
| 2 | Apprentice 2 | 8 hours | 4 hours |
| 3 | Apprentice 3 | 1 day | 8 hours |
| 4 | Apprentice 4 | 2 days | 1 day |
| 5 | Guru 1 | 1 week | 1 week |
| 6 | Guru 2 | 2 weeks | 2 weeks |
| 7 | Master | 1 month | 1 month |
| 8 | Enlightened | 4 months | 4 months |
| 9 | Burned | retired (no more reviews) | retired |

**Early-level acceleration:** WaniKani accelerates only its first two levels. Slonbelka extends the accelerated Apprentice timing through level 3 to make the early game faster, per the design intent of "looser at the start." The acceleration applies based on the item's level, not the learner's overall progress.

**Review timing rules**
- After a lesson, an item enters at Apprentice 1 with `available_at = now + interval(stage 1)`.
- On a correct review, advance one stage and set `available_at = now + interval(new stage)`.
- Reaching stage 9 (Burned) retires the item; it leaves the review queue and `burned_at` is set.
- Round `available_at` down to the top of the hour (matches WaniKani behavior, avoids trickle reviews).

**Incorrect-answer penalty** (WaniKani formula)

```
new_stage = max(1, current_stage - (incorrect_adjustment * penalty_factor))

incorrect_adjustment = round_half_up(incorrect_answers_this_review / 2)
penalty_factor       = 1 if current_stage <= 4 (Apprentice)
                       2 if current_stage >= 5 (Guru and above)
```

- `incorrect_answers_this_review` is the count of wrong answers for that item across its question types in the current review pass (0, 1, or 2 in v1). One wrong answer drops the stage by 1; items at Guru or above drop harder.
- Floor at stage 1.

**An item "passes" (is Guru'd)** the first time it reaches stage 5; record `passed_at`. This is the event the level gate counts.

The engine must be a pure, well-tested module (no I/O) so the transition logic can be unit and property tested in isolation. See section 18.

---

## 4. Level gating

Russian has no radical or kanji layer, so the level's words are the gate directly. A level unlocks the next when a target percentage of that level's vocab items have reached Guru.

| Level band | Unlock threshold (percent of the level's vocab at Guru) |
|-----------:|---------------------------------------------------------|
| 1 to 3 | 70% |
| 4 to 5 | 80% |
| 6 and up | 90% |

**Unlock flow**
1. Learner reaches level N. All of level N's items become available as lessons.
2. Learner does lessons at their pace (subject to the daily lesson cap, section 6).
3. Items accumulate Guru status through reviews.
4. When the Guru fraction of level N crosses the band threshold, level N+1 unlocks and its lessons appear.

Notes:
- The alphabet primer (level 0) is optional and does not gate anything.
- Thresholds and band boundaries live in config so they can be tuned without code changes.

---

## 5. Content model

### 5.1 Vocabulary item fields
- `lemma`: plain spelling (no stress marks), for example `молоко`.
- `stressed_form`: spelling with a combining acute (U+0301) on the stressed vowel, for example `молоко́`. Mandatory.
- `translation_primary`: the canonical English gloss shown in lessons.
- `translations`: an accept-list of English answers (synonyms, alternates) used by the grader.
- `part_of_speech`.
- `gender`: for nouns (m, f, n), null otherwise. Stored for future grammar work.
- `aspect`: for verbs (imperfective, perfective), null otherwise.
- `aspect_pair_id`: links a verb to its aspect partner, null if none.
- `ipa`: optional, from Wiktionary.
- `audio_url`: native or TTS audio (section 8).
- `frequency_rank`: source ranking, drives level ordering.
- `level`: assigned level number.
- `created_by`: null for curated items, a user id for self-added items.

### 5.2 Alphabet item fields (level 0, optional)
- `letter`, `name`, `sound_hint`, `audio_url`, `notes`. Reuses the item table with `type = kana`.

### 5.3 Mnemonics
- No curated mnemonics in v1 (writing them for 1,500+ words is out of scope).
- Each item exposes a per-user mnemonic field the learner can fill in (meaning mnemonic and reading mnemonic). Stored per user so they are personal.

### 5.4 Example sentences
- Each vocab item can have one or more sentences: `ru_text`, `en_text`, `audio_url` (TTS), `source` (Tatoeba id), `license`.

---

## 6. Lessons and reviews (UX flow)

### 6.1 Lesson flow
When an item is introduced, show a lesson card with: the stressed form, audio (autoplay optional), translation, part of speech and any gender or aspect, IPA if present, an example sentence with translation and audio, and the personal mnemonic field. A short "quiz yourself" step can immediately follow before the item enters the SRS queue.

- **Daily lesson cap:** a configurable setting that limits new lessons per day to keep the Apprentice pile manageable (default suggestion: 15 per day, learner-adjustable).

### 6.2 Review flow and question types
Each vocab item has two review question types, surfaced as separate review items (like WaniKani's meaning and reading split):
- **Meaning:** show the Russian word and play audio, learner types the English meaning.
- **Production:** show the English meaning, learner types the Russian word (on-screen Cyrillic keyboard, section 7).

An item advances its SRS stage only after both question types for that item are answered in the review pass. Wrong answers on either type feed the penalty count for that item.

### 6.3 Grading rules
- **Meaning (English):** accept anything in the `translations` accept-list. Apply typo tolerance via small edit distance (for example Levenshtein <= 1 for short answers, scaling slightly for longer). If close but not exact, show a "close, try again" warning and let the learner retype rather than instantly failing.
- **Production (Russian):** compare the typed answer to `lemma` after normalization:
  - Strip stress marks from both sides (the learner is not expected to type stress).
  - `ё` handling: accept both `е` and `ё` by default (configurable), since many texts collapse them. Canonical storage keeps the true `ё`.
  - Apply the same small typo tolerance and "close, try again" warning.
- **Override:** a "mark correct" control for when the grader misreads a near-miss or the learner fat-fingers. The override records the review as correct and flags `was_override = true` so it can be surfaced in stats. There is also a plain "retry" path for the warning state.
- **Feedback:** after answering, always show the stressed form so the learner sees correct stress, plus the audio and example sentence.

### 6.4 In-session re-quiz
Missed items are re-asked later in the same session before the session ends, so a miss does not get a free pass within the session. The SRS stage change is computed from the review pass once the item is resolved for the session.

---

## 7. Cyrillic input (on-screen keyboard)

A web app cannot switch the device OS keyboard to Russian, so input is handled by an in-app on-screen keyboard that appears for production reviews and for self-add entry. It doubles as the visual alphabet reference the learner asked for.

- **Default layout:** standard ЙЦУКЕН (the real Russian keyboard layout), so muscle memory transfers to actual Russian keyboards.
- **Phonetic toggle:** an optional homophonic layout that maps Cyrillic letters to their nearest Latin key positions, easier for beginners. The Latin-to-Cyrillic mapping needs to be defined in the build (an open item, section 24).
- **Long-press hint:** pressing and holding a key shows the letter name and sound, for the "I forgot which letter this is" case.
- Hardware keyboard input still works on desktop; the on-screen keyboard is additive, not a replacement.
- Active-key highlighting as the learner types, for layout learning.

---

## 8. Audio and pronunciation (playback only)

Three audio paths, all writing to one audio store referenced by URL:

1. **Curated deck, native audio first.** During the content build, check the Wiktionary bulk pronunciation audio (the `mp3_url` / `ogg_url` fields in the Wiktextract data) for each word. If a native recording exists, download and store it, capturing the per-file CC attribution. This gives real human pronunciation for a large share of the deck for free.
2. **Curated deck, TTS fallback.** For words without native audio, generate TTS at build time. Feed the **stressed form** to the engine (via the acute-accented spelling, SSML, or a pronunciation lexicon) so the voice places stress correctly. Russian stress is unpredictable and TTS mispronounces words without it, so this step is mandatory, not optional.
3. **Self-added words, on-demand TTS.** Arbitrary words cannot be pre-generated, so adding a word triggers a backend TTS call, generated once and cached to the same store. This means the backend keeps one live TTS integration even though the main deck is pre-generated.

**Sentence audio:** TTS at build time for curated example sentences (Tatoeba audio is a license patchwork and often non-commercial, so it is not used).

**Recommended TTS provider:** Azure Speech (ru-RU neural voices, good SSML and custom-lexicon support for stress control). OpenAI or Google TTS are acceptable alternatives. Final pick is an open item. The backend proxies the provider key; build-time generation is a one-off script.

---

## 9. Leeches (dedicated section)

WaniKani offloads leech handling to third-party scripts, so a built-in leech section is a deliberate improvement. Leeches get their own top-level section in the app with its own page and its own study mode.

**Leech score** (community-style formula, tunable):
```
leech_score = incorrect_count / max(1, correct_streak) ** 1.5
is_leech = leech_score >= 1.0
           OR the item has fallen from Guru-or-above back to Apprentice 2 or more times
```
- Recompute `leech_score` and `is_leech` after each review.
- Track Guru-to-Apprentice demotions to catch items that keep "falling back."

**Leech section UI**
- A dedicated page listing current leeches with their stats (accuracy, current stage, times missed, last seen).
- A leech study mode: practice only the flagged words. By default this practice is no-stakes and does not change SRS stages (so cramming a leech does not artificially Guru it); an optional setting can let it count. This is an open item (section 24).
- Inline prompt to add or rewrite the item's mnemonic from the leech page.

---

## 10. Study modes

- **Reviews:** the scheduled SRS queue (the default daily activity).
- **Lessons:** introduce new unlocked items, capped per day.
- **Extra study:** free practice that does not change SRS stages. Modes: recent mistakes, recently learned, or a whole level.
- **Leech training:** practice the leech set (section 9).
- **Vacation / freeze mode:** a toggle that pauses SRS so reviews do not accumulate while away. While frozen, `available_at` timestamps do not advance toward "due," and nothing is overdue on return. Implementation: store `vacation_started_at`; on unfreeze, shift all pending `available_at` forward by the frozen duration (or equivalently store a per-user frozen offset). Document the exact mechanism in code.

---

## 11. Dashboard and stats

The "logging" surface. Shows:
- Current level and progress toward the next-level threshold (Guru fraction of the current level).
- SRS stage breakdown (counts in Apprentice, Guru, Master, Enlightened, Burned).
- Review forecast (how many reviews come due over the next hours and days).
- Streak (consecutive days with reviews completed).
- Accuracy (overall and recent, optionally split by meaning vs production).
- Leech count, linking to the leech section.

---

## 12. Reminders and notifications

Gated SRS only works if reviews happen on time, so reminders are in scope.
- **Web Push (PWA):** notify when a batch of reviews comes due. Uses VAPID keys and a stored push subscription per device.
- **Optional email digest:** a daily or "reviews waiting" email. Provider is an open item (SES, Resend, or SMTP).
- Notification preferences live in settings (on/off, quiet hours).

---

## 13. Offline and sync

The learner is mobile-heavy, so reviews must work offline.
- **PWA / service worker** caches the app shell, the learner's assigned items, and their audio for offline use.
- **Review events are append-only.** Each answered review is recorded as an event with a client-generated id and an `answered_at` timestamp, queued locally in IndexedDB when offline.
- **Sync** uploads queued events in batches. The server is the source of truth. Because events are append-only with timestamps and idempotent client ids, the server replays them in order to advance SRS state; duplicates are ignored by client id. A derived `user_item_state` row gives fast reads.
- Conflict policy: events are additive and idempotent, so there is no destructive merge. If the same item is reviewed on two devices while offline, both events are recorded and applied in timestamp order.

---

## 14. Accounts and auth (first-class)

Export was dropped in favor of real accounts and reliable persistence, so auth is a first-class feature, not a stub.
- **Email plus password.** Hash with Argon2 (or bcrypt). HTTPS only.
- **Tokens:** short-lived access token plus refresh token (JWT), or server-side sessions. Consider `fastapi-users` to avoid hand-rolling.
- **All SRS state persists server-side** in Postgres; the client cache is a convenience for offline, never the source of truth.
- **Multi-user schema** from the start (a `users` table, all state keyed by `user_id`), even though v1 has one user. A simple magic-link login is an acceptable alternative if preferred; password is the default.

---

## 15. Self-added words (secondary feature)

A lighter-weight path than the curated flow, but present from day one.
- **Add by lookup with auto-fill:** the learner types a Russian word; the app fills `stressed_form`, `translation`, `part_of_speech`, `gender` or `aspect`, and IPA from the same dictionary data used for the curated deck (Wiktextract / OpenRussian). The learner can edit before saving.
- **On-demand audio:** saving triggers backend TTS, cached to the audio store (section 8).
- Self-added items get `created_by = user_id` and enter the same SRS machinery (assigned to a "custom" bucket or appended after the curated levels, builder's choice).

---

## 16. Content pipeline (build time)

Standalone scripts (in `/pipeline`) that produce the seed dataset loaded into Postgres. Run offline, not at request time.

**Sources and licenses**
- **Frequency ordering:** hermitdave/FrequencyWords Russian list (OpenSubtitles, code MIT, data reusable with attribution to OpenSubtitles), or the `wordfreq` Python package. Drives `frequency_rank` and level assignment.
- **Word data:** English Wiktionary via Kaikki / Wiktextract (CC-BY-SA and GFDL). Provides English glosses, IPA, part of speech, gender, aspect, and stress (Wiktionary marks Russian stress with acute accents). Supplement with OpenRussian for stress and `ё` coverage; the FreeLanguageTools/stress-russian-books project is a working precedent for deriving stress and `ё` from these sources.
- **Audio:** Wiktionary / Commons bulk pronunciation audio (CC, per-file licenses captured) for native recordings; TTS fallback otherwise.
- **Example sentences:** Tatoeba (text CC-BY 2.0 FR, attribute Tatoeba and the contributor). Sentence audio via TTS.

**Pipeline steps**
1. Load the frequency list, normalize tokens, drop non-words and proper nouns as needed.
2. For each lemma, join against the Wiktextract dataset to pull gloss(es), POS, gender, aspect, IPA, stressed form, and any audio URLs. Supplement stress and `ё` from OpenRussian where Wiktionary is missing.
3. Resolve stress for every word (this is non-negotiable seed quality: no item ships without `stressed_form`).
4. Fetch native audio where a URL exists; record the file license and attribution.
5. Generate TTS for words and example sentences lacking native audio.
6. Bucket words into levels (default 25 to 30 per level, frequency order, optionally nudging to group easy early words).
7. Attach 1 to 2 example sentences per item from Tatoeba.
8. Emit the seed (SQL inserts or a SQLite/JSON artifact) consumed by a backend seed step.

**Seed validation** (a test, not a hope): every item has a non-empty `stressed_form`, a valid POS, at least one translation, and a reachable `audio_url` (native or TTS-flagged). Fail the build otherwise.

**v1 target size:** the first ~1,500 frequency-ranked lemmas, roughly 50 levels. Configurable; phase the build so early levels ship first.

---

## 17. Data model (Postgres)

Tables (columns abbreviated; add timestamps and indexes as needed):

- **users**: `id, email, password_hash, timezone, current_level, settings (jsonb), created_at`
- **items**: `id, type (vocab|kana), level, lemma, stressed_form, translation_primary, translations (jsonb), part_of_speech, gender, aspect, aspect_pair_id (fk items.id), ipa, audio_url, frequency_rank, notes, created_by (fk users.id, null=curated), created_at`
- **example_sentences**: `id, item_id (fk), ru_text, en_text, audio_url, source, license`
- **mnemonics**: `id, item_id (fk), user_id (fk), meaning_mnemonic, reading_mnemonic, updated_at` (unique on item_id+user_id)
- **user_item_state**: `id, user_id (fk), item_id (fk), srs_stage, unlocked_at, available_at, passed_at, burned_at, correct_count, incorrect_count, correct_streak, guru_to_apprentice_demotions, last_reviewed_at, leech_score, is_leech` (unique on user_id+item_id)
- **review_events**: `id, user_id (fk), item_id (fk), question_type (meaning|production), client_event_id (unique per user, for idempotent sync), correct (bool), was_override (bool), srs_before, srs_after, answered_at, created_at`
- **lesson_events**: `id, user_id (fk), item_id (fk), learned_at`
- **push_subscriptions**: `id, user_id (fk), endpoint, keys (jsonb), created_at`
- **audio_assets** (optional but recommended for license tracking): `id, key, url, source, license, attribution`
- **auth tokens / refresh tokens** as required by the chosen auth approach.

Derive level membership from `items.level`. Keep `user_item_state` as the fast-read projection of the `review_events` log.

---

## 18. API design (REST, FastAPI)

Auth
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`

Lessons
- `GET /lessons` (next batch of unlocked, unlearned items, respecting the daily cap)
- `POST /lessons/complete` (`item_ids`)

Reviews and sync
- `GET /reviews` (due items with their pending question types)
- `POST /reviews` (idempotent on `client_event_id`: `item_id, question_type, correct, was_override, answered_at`)
- `POST /sync` (batch upload of queued `review_events`)
- `GET /sync?since=<ts>` (pull server state changes)
- `GET /reviews/forecast`

Items, search, self-add
- `GET /items?level=`, `GET /items/{id}`, `GET /items/search?q=`
- `POST /items` (self-add, triggers auto-fill and TTS), `PATCH /items/{id}`
- `PUT /items/{id}/mnemonic`

Leeches and extra study
- `GET /leeches`, `POST /leeches/study`
- `GET /extra-study?mode=recent_mistakes|recently_learned|level&level=`

Dashboard, settings, notifications, audio
- `GET /dashboard`
- `GET /settings`, `PATCH /settings`
- `POST /settings/vacation` (`on|off`)
- `POST /audio/tts` (`text, stressed_form` -> generates/caches, returns url)
- `POST /push/subscribe`, `DELETE /push/subscribe`

All write endpoints validate with Pydantic; review and sync writes are idempotent.

---

## 19. Architecture and stack

**Frontend**
- React (Vite) + TypeScript, Tailwind for styling.
- PWA via a service worker (Workbox); IndexedDB (Dexie) for the offline cache and the review-event queue.
- Data layer: React Query for server state, a light store (Zustand) for session/UI state. React Router for routing.

**Backend**
- FastAPI (Python), SQLAlchemy + Alembic migrations, Pydantic.
- Postgres.
- Auth via passlib (Argon2) + JWT, or `fastapi-users`.
- Web Push via `pywebpush`; optional email via the chosen provider.
- The **SRS engine is a pure module** (no DB calls) so it can be unit and property tested; the API layer wraps it.

**Audio storage**
- S3-compatible object storage (Cloudflare R2 or Backblaze B2 are cheap) behind a CDN. For the simplest v1, serving from a single bucket is fine.

**TTS**
- Azure Speech SDK server-side, used both at build time (one-off script) and on demand for self-added words.

**Hosting**
- Frontend: Vercel, Netlify, or Cloudflare Pages.
- Backend: Railway, Render, or Fly.io.
- Postgres: managed (Railway, Render, Neon, or Supabase).

---

## 20. Repository structure

Monorepo:
```
/backend     FastAPI app: models, routers, services, srs/ (pure engine), alembic/, tests/
/frontend    React PWA: src/ (components, pages, sw, lib), tests/
/pipeline    content build scripts: frequency, wiktextract join, audio fetch, TTS gen, seed emit
/data        generated seed artifacts (gitignored or Git LFS)
/docs        this design doc, API notes, ADRs
docker-compose.yml   Postgres + backend + frontend for local dev
README.md
```

---

## 21. Testing

The author values tests; cover the correctness-critical core heavily.

- **SRS engine (backend, highest priority):** unit tests for every stage transition (standard and accelerated levels 1 to 3), the penalty formula (floor at stage 1, penalty factor switch at Guru, 1 vs 2 wrongs), Guru detection, and Burned retirement. Property tests (Hypothesis) for invariants: stage always in 1 to 9, correct answers never lower the stage, `available_at` set on every transition.
- **Gating:** tests that level N+1 unlocks at the right Guru fraction for each level band, and not before.
- **Leech scoring:** tests for the score formula and the Guru-to-Apprentice demotion trigger.
- **Grading:** typo tolerance bounds, accept-list matching, stress stripping, `ё`/`е` equivalence, the override path, and the "close, try again" warning state.
- **Sync:** idempotent replay (duplicate `client_event_id` ignored), out-of-order events applied by timestamp, offline-then-reconnect.
- **Content pipeline:** join correctness, stress presence, dedup, level bucketing, and the seed validation gate.
- **Frontend:** component tests (Vitest + Testing Library) for the review flow, grading UI, and on-screen keyboard; an end-to-end offline-and-sync test (Playwright).

---

## 22. Build phases

Phased so early levels are usable quickly.

- **Phase 0:** repo scaffold, docker-compose, CI, auth, schema and migrations.
- **Phase 1:** content pipeline producing the first ~10 levels (~300 words) with stress, translations, and audio; seed validation.
- **Phase 2:** SRS engine + lessons and reviews API + review UI (meaning and production), grading with override, on-screen Cyrillic keyboard.
- **Phase 3:** level gating + dashboard and stats + review forecast.
- **Phase 4:** offline + sync + PWA install + web push reminders.
- **Phase 5:** leech section + extra study + vacation mode.
- **Phase 6:** self-added words (auto-fill + on-demand TTS) + optional alphabet primer (level 0).
- **Phase 7:** polish, accessibility, keyboard shortcuts, full seed (~1,500 words, ~50 levels).

---

## 23. Russian-specific notes

- **Stress is mandatory metadata.** Store `stressed_form` with a combining acute (U+0301) on the stressed vowel. Display it in lessons and in answer feedback. Do not require typing stress; normalize it out for grading.
- **`ё` vs `е`.** Store the true `ё` form as canonical. Accept both in production answers by default (configurable). Use `ё`-explicit canonical forms for clearer learning.
- **Stress-distinguished homographs** (за́мок vs замо́к, пи́сать vs писа́ть) are distinct items keyed by `stressed_form`.
- **Aspect pairs** (imperfective and perfective): store `aspect` and `aspect_pair_id` so pairs can be shown or learned together. v1 may introduce them as separate, linked items.
- **Gender** for nouns is stored for future grammar features even though v1 does not drill it.
- **Cases, declension, conjugation** are out of scope for v1, but the schema leaves room (an `inflections` table can be added later without disruption).
- **TTS stress:** feed the acute-accented form or use SSML or a lexicon so the voice stresses correctly. Verify behavior per provider during the build.

---

## 24. Open decisions for the build agent

- **TTS provider** final pick (Azure recommended) and the specific ru-RU voice; confirm stress control method (SSML vs lexicon vs accented spelling).
- **Object storage** choice (R2, B2, or S3).
- **Words per level and total v1 size** (defaults: 25 to 30 per level, ~1,500 words).
- **Phonetic keyboard layout:** define the exact Latin-to-Cyrillic key mapping for the optional phonetic mode.
- **Email provider** for digests (optional feature).
- **Leech practice and SRS:** default is no-stakes (does not change SRS); decide whether to expose a toggle that lets it count.
- **Auth method:** password (default) vs magic link.

---

## 25. Licensing and attribution summary

For a personal, non-commercial build with attribution, the source set is workable. Capture attributions in-app or in a CREDITS file.

- **FrequencyWords (OpenSubtitles):** attribute OpenSubtitles; CC-BY-SA on the data.
- **Wiktionary / Wiktextract (Kaikki):** CC-BY-SA and GFDL; attribute Wiktionary. Share-alike applies to derived dictionary data.
- **Wiktionary / Commons audio:** CC licenses vary per file; store author and license per audio asset.
- **Tatoeba sentences:** CC-BY 2.0 FR; attribute Tatoeba and the sentence contributor. Tatoeba audio is mixed and often non-commercial, so it is not used (TTS instead).
- **TTS-generated audio:** governed by the provider terms; fine for app use. Re-check redistribution terms if the app is ever made public or commercial.

If the app is later commercialized, revisit the share-alike (CC-BY-SA) and any non-commercial constraints before shipping.
