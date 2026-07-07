"""
Lessons and reviews service.

Wraps the pure SRS engine and persists to user_item_state while appending to the
append-only review_events log (the source of truth for sync).

Review-pass semantics (matches WaniKani):
- A vocab item has two question types: meaning and production. A pass is complete
  once every required type has at least one CORRECT answer. The client re-quizzes
  missed types until correct, submitting each attempt.
- The item still counts as a miss if any required type had any incorrect answer in
  the pass. Getting it wrong then right still lowers the SRS stage.
- A NEAR_MISS (typo, beyond tolerance) is not recorded; the client asks for a retry.
- An override records a CORRECT answer (used when the grader misread a near-miss).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app import grading
from app.timeutil import aware as _aware, utcnow as _utcnow
from app.models import Item, LessonEvent, ReviewEvent, User, UserItemState
from app.srs import engine

DEFAULT_DAILY_LESSON_CAP = 15




def required_types(item: Item) -> set[str]:
    if item.type == "vocab":
        return {"meaning", "production"}
    return {"meaning"}


# --------------------------------------------------------------------------- #
# Lessons
# --------------------------------------------------------------------------- #
def get_lessons(db: Session, user: User, limit: int | None = None) -> list[Item]:
    """Unlocked, not-yet-started items the user is entitled to access."""
    from app.services import entitlements

    max_level = entitlements.accessible_level(db, user)
    started = select(UserItemState.item_id).where(UserItemState.user_id == user.id)
    q = (
        select(Item)
        .where(and_(Item.level <= max_level, Item.id.not_in(started)))
        .order_by(Item.level, Item.frequency_rank, Item.id)
    )
    items = list(db.scalars(q).all())

    cap = (user.settings or {}).get("daily_lesson_cap", DEFAULT_DAILY_LESSON_CAP)
    start_of_day = datetime.combine(_utcnow().date(), time.min, tzinfo=timezone.utc)
    done_today = db.scalar(
        select(func.count())
        .select_from(LessonEvent)
        .where(and_(LessonEvent.user_id == user.id, LessonEvent.learned_at >= start_of_day))
    ) or 0
    remaining = max(0, cap - done_today)
    items = items[:remaining]
    if limit is not None:
        items = items[:limit]
    return items


def _start_item(db: Session, user: User, item: Item, now: datetime) -> UserItemState:
    """Create the SRS state for a newly learned item at Apprentice 1."""
    state = UserItemState(
        user_id=user.id,
        item_id=item.id,
        srs_stage=engine.APPRENTICE_1,
        unlocked_at=now,
        available_at=engine.next_available_at(engine.APPRENTICE_1, item.level, now),
    )
    db.add(state)
    db.add(LessonEvent(user_id=user.id, item_id=item.id, learned_at=now))
    return state


def complete_lessons(db: Session, user: User, item_ids: list[int]) -> dict:
    """
    Commit learned items into the SRS queue at Apprentice 1.

    The lesson quiz is graded on the client (no per-answer round-trips while
    drilling); this is the single batched commit at the end of a session. The
    cap and paywall are still enforced here so the gate cannot be bypassed by
    calling this directly. Returns started / over_cap / skipped item ids
    (skipped = locked, not accessible, or already started).
    """
    from app.services import entitlements

    now = _utcnow()
    max_level = entitlements.accessible_level(db, user)
    cap = (user.settings or {}).get("daily_lesson_cap", DEFAULT_DAILY_LESSON_CAP)
    start_of_day = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    done_today = db.scalar(
        select(func.count())
        .select_from(LessonEvent)
        .where(and_(LessonEvent.user_id == user.id, LessonEvent.learned_at >= start_of_day))
    ) or 0
    remaining = max(0, cap - done_today)

    started: list[int] = []
    over_cap: list[int] = []
    skipped: list[int] = []
    for item_id in item_ids:
        item = db.get(Item, item_id)
        if item is None or item.level > max_level:
            skipped.append(item_id)
            continue
        exists = db.scalar(
            select(UserItemState).where(
                and_(UserItemState.user_id == user.id, UserItemState.item_id == item_id)
            )
        )
        if exists is not None:
            skipped.append(item_id)
            continue
        if len(started) >= remaining:
            over_cap.append(item_id)
            continue
        _start_item(db, user, item, now)
        started.append(item_id)

    db.commit()
    return {"started": started, "over_cap": over_cap, "skipped": skipped}


# --------------------------------------------------------------------------- #
# Reviews
# --------------------------------------------------------------------------- #
def _pass_events(db: Session, user_id: int, item_id: int, floor: datetime | None) -> list[ReviewEvent]:
    q = select(ReviewEvent).where(
        and_(ReviewEvent.user_id == user_id, ReviewEvent.item_id == item_id)
    )
    if floor is not None:
        q = q.where(ReviewEvent.answered_at > floor)
    return list(db.scalars(q).all())


def get_reviews(db: Session, user: User, now: datetime | None = None) -> list[dict]:
    """Due review items, expanded to one entry per pending question type."""
    now = now or _utcnow()

    # Vacation freeze: no reviews surface while paused.
    if (user.settings or {}).get("vacation_started_at"):
        return []

    states = db.scalars(
        select(UserItemState).where(
            and_(
                UserItemState.user_id == user.id,
                UserItemState.available_at.is_not(None),
                UserItemState.available_at <= now,
            )
        )
    ).all()
    if not states:
        return []

    # Batch-load the items and the relevant review events (avoids N+1).
    item_ids = [s.item_id for s in states]
    items = {
        i.id: i for i in db.scalars(select(Item).where(Item.id.in_(item_ids))).all()
    }
    events_by_item: dict[int, list[ReviewEvent]] = defaultdict(list)
    for ev in db.scalars(
        select(ReviewEvent).where(
            and_(ReviewEvent.user_id == user.id, ReviewEvent.item_id.in_(item_ids))
        )
    ).all():
        events_by_item[ev.item_id].append(ev)

    out: list[dict] = []
    for state in states:
        item = items.get(state.item_id)
        if item is None or engine.is_burned(state.srs_stage):
            continue
        floor = _aware(state.last_reviewed_at)
        events = [
            e for e in events_by_item[item.id]
            if floor is None or _aware(e.answered_at) > floor
        ]
        correct_types = {e.question_type for e in events if e.correct} & required_types(item)
        pending = required_types(item) - correct_types
        for qtype in sorted(pending):
            entry = {"item_id": item.id, "question_type": qtype, "part_of_speech": item.part_of_speech}
            if qtype == "meaning":
                entry["prompt"] = item.stressed_form
                entry["audio_url"] = item.audio_url
            else:  # production
                entry["prompt"] = item.translation_primary
                entry["audio_url"] = None
            out.append(entry)
    return out


def _level_guru_count(db: Session, user_id: int, level: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(UserItemState)
        .join(Item, Item.id == UserItemState.item_id)
        .where(
            and_(
                UserItemState.user_id == user_id,
                Item.level == level,
                UserItemState.srs_stage >= engine.GURU_THRESHOLD,
            )
        )
    ) or 0


def _level_total(db: Session, level: int) -> int:
    return db.scalar(select(func.count()).select_from(Item).where(Item.level == level)) or 0


def sync_reviews(db: Session, user: User, events: list[dict]) -> list[dict]:
    """
    Replay a batch of queued offline review answers. Each event is processed
    through submit_review, which is idempotent on client_event_id, so re-syncing
    the same events is safe. Events are applied in answered_at order.
    """
    ordered = sorted(events, key=lambda e: e.get("answered_at") or _utcnow())
    results: list[dict] = []
    for ev in ordered:
        res = submit_review(
            db,
            user,
            item_id=ev["item_id"],
            question_type=ev["question_type"],
            answer=ev.get("answer", ""),
            client_event_id=ev["client_event_id"],
            answered_at=ev.get("answered_at"),
            override=ev.get("override", False),
        )
        if "error" in res:
            results.append({"client_event_id": ev["client_event_id"], "status": "error", "error": res["error"]})
        else:
            results.append({
                "client_event_id": ev["client_event_id"],
                "status": res["status"],
                "srs_stage": res.get("srs_stage"),
            })
    return results


def maybe_level_up(db: Session, user: User) -> bool:
    """
    Advance the user to the next level if the current one has cleared its Guru
    threshold and the user is entitled to the next level. Returns True if a
    level-up happened. Free users are walled at the free-level limit.
    """
    from app.services import entitlements

    level = user.current_level
    total = _level_total(db, level)
    guru = _level_guru_count(db, user.id, level)
    if engine.level_is_cleared(guru, total, level) and entitlements.can_advance_to(db, user, level + 1):
        user.current_level = level + 1
        return True
    return False


def submit_review(
    db: Session,
    user: User,
    item_id: int,
    question_type: str,
    answer: str,
    client_event_id: str,
    answered_at: datetime | None = None,
    override: bool = False,
) -> dict:
    """Grade and record one answer; advance the SRS stage when the pass completes."""
    now = answered_at or _utcnow()
    item = db.get(Item, item_id)
    if item is None:
        return {"error": "item_not_found"}
    if question_type not in required_types(item):
        return {"error": "bad_question_type"}

    state = db.scalar(
        select(UserItemState).where(
            and_(UserItemState.user_id == user.id, UserItemState.item_id == item_id)
        )
    )
    if state is None:
        return {"error": "not_started"}

    stage_before = state.srs_stage
    feedback_answer = item.translation_primary if question_type == "meaning" else item.stressed_form

    # Idempotency first: a re-sent answer returns the original result without
    # re-applying, regardless of the item's current due state.
    existing = db.scalar(
        select(ReviewEvent).where(
            and_(ReviewEvent.user_id == user.id, ReviewEvent.client_event_id == client_event_id)
        )
    )
    if existing is not None:
        return {
            "status": "duplicate",
            "correct": existing.correct,
            "srs_stage": state.srs_stage,
            "srs_stage_before": stage_before,
            "srs_stage_before_name": engine.STAGE_NAMES[stage_before],
            "srs_stage_name": engine.STAGE_NAMES[state.srs_stage],
            "available_at": state.available_at,
            "pass_complete": existing.srs_after is not None,
            "expected": feedback_answer,
            "stressed_form": item.stressed_form,
        }

    if state.available_at is None or _aware(state.available_at) > _utcnow():
        return {"error": "not_due"}

    # Grade.
    if override:
        grade = grading.Grade.CORRECT
    elif question_type == "meaning":
        from app.services import synonyms

        accept = (item.translations or [item.translation_primary]) + synonyms.get_synonyms(db, user.id, item.id)
        grade = grading.grade_meaning(answer, accept)
    else:
        grade = grading.grade_production(answer, item.lemma)

    # A near miss is a retry, not a record.
    if grade is grading.Grade.NEAR_MISS and not override:
        return {
            "status": "near_miss",
            "correct": False,
            "srs_stage": state.srs_stage,
            "srs_stage_before": stage_before,
            "srs_stage_before_name": engine.STAGE_NAMES[stage_before],
            "srs_stage_name": engine.STAGE_NAMES[state.srs_stage],
            "available_at": state.available_at,
            "pass_complete": False,
            "expected": feedback_answer,
            "stressed_form": item.stressed_form,
        }

    correct = grade is grading.Grade.CORRECT
    event = ReviewEvent(
        user_id=user.id,
        item_id=item.id,
        question_type=question_type,
        client_event_id=client_event_id,
        correct=correct,
        was_override=override,
        srs_before=state.srs_stage,
        srs_after=None,
        answered_at=now,
    )
    db.add(event)
    db.flush()  # so the pass query sees this event

    events = _pass_events(db, user.id, item.id, state.last_reviewed_at)
    req = required_types(item)
    correct_types = {e.question_type for e in events if e.correct} & req
    incorrect_types = {e.question_type for e in events if not e.correct} & req
    pass_complete = req <= correct_types

    result_passed = False
    result_burned = False
    leveled_up = False
    if pass_complete:
        incorrect_count = len(incorrect_types)
        was_guru = engine.is_guru(state.srs_stage)
        result = engine.review(
            stage=state.srs_stage,
            incorrect_answers=incorrect_count,
            level=item.level,
            now=now,
            already_passed=state.passed_at is not None,
        )
        # Update cumulative counts and streak.
        state.correct_count += len(req) - incorrect_count
        state.incorrect_count += incorrect_count
        state.correct_streak = state.correct_streak + 1 if incorrect_count == 0 else 0
        if was_guru and not engine.is_guru(result.new_stage):
            state.guru_to_apprentice_demotions += 1
        state.srs_stage = result.new_stage
        state.available_at = result.available_at
        state.last_reviewed_at = now
        if result.passed and state.passed_at is None:
            state.passed_at = now
        if result.burned:
            state.burned_at = now
        state.leech_score = engine.leech_score(state.incorrect_count, state.correct_streak)
        state.is_leech = engine.is_leech(
            state.incorrect_count, state.correct_streak, state.guru_to_apprentice_demotions
        )
        event.srs_after = result.new_stage
        result_passed = result.passed
        result_burned = result.burned
        db.flush()
        leveled_up = maybe_level_up(db, user)

    db.commit()
    db.refresh(state)
    return {
        "status": grade.value if not override else "override",
        "correct": correct,
        "srs_stage": state.srs_stage,
        "srs_stage_before": stage_before,
        "srs_stage_before_name": engine.STAGE_NAMES[stage_before],
        "srs_stage_name": engine.STAGE_NAMES[state.srs_stage],
        "available_at": state.available_at,
        "pass_complete": pass_complete,
        "passed": result_passed,
        "burned": result_burned,
        "expected": feedback_answer,
        "stressed_form": item.stressed_form,
        "leveled_up": leveled_up,
        "current_level": user.current_level,
    }
