import { useEffect, useMemo, useRef, useState } from "react";
import SessionSummary from "./SessionSummary";
import { completeLessons, getLessons, getSettings, LessonItem, updateSettings } from "../lib/api";
import { gradeMeaning, gradeProduction } from "../lib/grading";
import {
  cacheLessons,
  cachedLessons,
  clearCachedLessons,
  enqueueLessonCompletion,
} from "../lib/offlineQueue";
import { shuffle, spreadPairs } from "../lib/shuffle";
import { useFetch } from "../lib/useFetch";
import { Layout } from "./CyrillicKeyboard";
import ProductionInput from "./ProductionInput";

type Phase = "info" | "quiz" | "committing" | "done";
type QType = "meaning" | "production";

interface Question {
  itemId: number;
  type: QType;
  item: LessonItem;
}

interface Feedback {
  correct: boolean;
  expected: string; // shown emphasized (stressed form / primary translation)
}

function buildQueue(items: LessonItem[]): Question[] {
  const qs: Question[] = [];
  for (const item of items) {
    qs.push({ itemId: item.id, type: "meaning", item });
    if (item.type === "vocab") qs.push({ itemId: item.id, type: "production", item });
  }
  return spreadPairs(shuffle(qs), (q) => q.itemId);
}

export default function LessonSession({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<LessonItem[] | null>(null);
  const [phase, setPhase] = useState<Phase>("info");
  const [infoIdx, setInfoIdx] = useState(0);

  const [queue, setQueue] = useState<Question[]>([]);
  const [quizTotal, setQuizTotal] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [nearMiss, setNearMiss] = useState(false);
  const [summary, setSummary] = useState<{ started: number; offline?: boolean } | null>(null);
  const quizStats = useRef({ first: new Map<string, boolean>() });

  // On-screen keyboard layout: saved setting, overridable in-session.
  const settingsFetch = useFetch(getSettings);
  const [kbOverride, setKbOverride] = useState<Layout | null>(null);
  const kbLayout: Layout =
    kbOverride ?? (settingsFetch.data?.keyboard_layout === "phonetic" ? "phonetic" : "jcuken");
  const toggleKb = () => {
    const next: Layout = kbLayout === "jcuken" ? "phonetic" : "jcuken";
    setKbOverride(next);
    updateSettings({ keyboard_layout: next }).catch(() => {
      /* the in-session toggle still applies */
    });
  };

  useEffect(() => {
    // Cache each successful fetch so the lesson still works offline; fall
    // back to the cached list when the network is unavailable.
    getLessons()
      .then((ls) => {
        setItems(ls);
        cacheLessons(ls);
      })
      .catch(async () => {
        const cached = await cachedLessons<LessonItem>();
        setItems(cached ?? []);
      });
  }, []);

  const remainingItems = useMemo(
    () => new Set(queue.map((q) => q.itemId)).size,
    [queue],
  );

  const nextInfo = () => {
    if (!items) return;
    if (infoIdx >= items.length - 1) {
      const q = buildQueue(items);
      setQuizTotal(q.length);
      setQueue(q);
      setPhase("quiz");
    } else {
      setInfoIdx((i) => i + 1);
    }
  };

  const commit = async () => {
    if (!items) return;
    setPhase("committing");
    const ids = items.map((i) => i.id);
    try {
      const res = await completeLessons(ids);
      setSummary({ started: res.started.length });
    } catch {
      // Offline: queue the completion for sync and report the lesson as done.
      await enqueueLessonCompletion(ids);
      setSummary({ started: ids.length, offline: true });
    }
    // Either way these words are used up; a stale cache would re-offer them.
    clearCachedLessons();
    setPhase("done");
  };

  const grade = (override: boolean) => {
    const q = queue[0];
    if (!q || feedback !== null) return;
    const isM = q.type === "meaning";
    const g = override
      ? "correct"
      : isM
        ? gradeMeaning(input, q.item.translations.length ? q.item.translations : [q.item.translation_primary])
        : gradeProduction(input, q.item.lemma);

    if (g === "near_miss") {
      setNearMiss(true);
      return;
    }
    setNearMiss(false);
    const key = `${q.item.id}:${q.type}`;
    if (!quizStats.current.first.has(key)) quizStats.current.first.set(key, g === "correct");
    setFeedback({
      correct: g === "correct",
      expected: isM ? q.item.translation_primary : q.item.stressed_form,
    });
  };

  const next = async () => {
    if (queue.length === 0) return;
    const wasCorrect = feedback?.correct ?? false;
    const [first, ...rest] = queue;
    const newQueue = wasCorrect ? rest : [...rest, first]; // re-drill misses
    setInput("");
    setFeedback(null);
    setNearMiss(false);
    if (newQueue.length === 0) {
      setQueue(newQueue);
      await commit();
    } else {
      setQueue(newQueue);
    }
  };

  // Enter drives the lesson even when nothing is focused (auto-focus is not
  // guaranteed in every browser): next info card, submit the typed answer,
  // advance from feedback. Skipped while focus is in a field or on a button,
  // whose native click already fires on Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLButtonElement
      )
        return;
      if (phase === "info") nextInfo();
      else if (phase === "quiz") {
        if (feedback !== null) next();
        else if (input) grade(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (items === null) return <Centered>loading lessons...</Centered>;
  if (items.length === 0)
    return (
      <Centered>
        No new lessons right now.
        <HomeLink onDone={onDone} />
      </Centered>
    );

  // ---- info phase: browse the new words ----
  if (phase === "info") {
    const item = items[infoIdx];
    const last = infoIdx === items.length - 1;
    return (
      <div className="mx-auto mt-6 w-full max-w-md px-6 text-center">
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={onDone}
            aria-label="End lesson"
            className="h-9 w-9 shrink-0 rounded-xl bg-sb-card2 text-base text-sb-ink hover:bg-sb-line"
          >
            ✕
          </button>
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-sb-card2"
            role="progressbar"
            aria-label="Lesson progress"
            aria-valuenow={infoIdx + 1}
            aria-valuemin={0}
            aria-valuemax={items.length}
          >
            <div
              className="h-full rounded-full bg-sb-accent transition-all"
              style={{ width: `${((infoIdx + 1) / items.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium text-sb-muted">
            {infoIdx + 1} / {items.length}
          </span>
        </div>
        <p className="mb-3 text-sm font-medium text-sb-muted">
          Новое слово {infoIdx + 1} из {items.length} · New word {infoIdx + 1} of {items.length}
        </p>
        <div className="rounded-3xl border border-sb-line bg-sb-card p-8 shadow-xl shadow-black/5">
          <div className="mb-3 font-display text-5xl font-bold text-sb-ink">{item.stressed_form}</div>
          <div className="text-xl font-semibold text-sb-ink">{item.translation_primary}</div>
          {item.translations.length > 1 && (
            <div className="mt-1 text-sm text-sb-muted">
              также · also: {item.translations.filter((t) => t !== item.translation_primary).join(", ")}
            </div>
          )}
          {[item.part_of_speech, item.gender, item.aspect].some(Boolean) && (
            <div className="mt-3 inline-block rounded-full bg-sb-accent-soft px-3 py-1 text-xs font-semibold text-sb-accent">
              {[item.part_of_speech, item.gender, item.aspect].filter(Boolean).join(" · ")}
            </div>
          )}
          {item.audio_url && (
            <div className="mt-4">
              <button
                onClick={() => new Audio(item.audio_url!).play()}
                className="rounded-full bg-sb-card2 px-4 py-1.5 text-sm font-semibold text-sb-ink"
              >
                ▶ прослушать · play
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-2.5">
          <button
            onClick={() => setInfoIdx((i) => Math.max(0, i - 1))}
            disabled={infoIdx === 0}
            className="rounded-xl bg-sb-card2 px-5 py-3 font-semibold text-sb-muted disabled:opacity-30"
          >
            Назад
          </button>
          <button
            onClick={nextInfo}
            className="flex-1 rounded-xl bg-sb-ink px-5 py-3 font-bold text-white"
          >
            {last ? "Начать квиз · Start quiz" : "Далее · Next"}
          </button>
        </div>
      </div>
    );
  }

  // ---- committing / done ----
  if (phase === "committing") return <Centered>saving...</Centered>;
  if (phase === "done") {
    const first = quizStats.current.first;
    const totalQ = first.size;
    const correctQ = [...first.values()].filter(Boolean).length;
    const acc = totalQ ? Math.round((correctQ / totalQ) * 100) : null;
    return (
      <SessionSummary
        title="Урок пройден · Lesson complete"
        subtitle="These words are now in your review queue."
        stats={[
          { label: "Words learned", value: String(summary?.started ?? items.length) },
          { label: "Quiz accuracy", value: acc != null ? `${acc}%` : "—" },
        ]}
        note={
          summary?.offline
            ? "Saved offline. The words will be committed when you're back online."
            : undefined
        }
        onDone={onDone}
      />
    );
  }

  // ---- quiz phase ----
  const cur = queue[0];
  const isMeaning = cur.type === "meaning";
  const quizProgress = quizTotal > 0 ? Math.round(((quizTotal - queue.length) / quizTotal) * 100) : 0;

  return (
    <div className="mx-auto mt-6 w-full max-w-md px-5">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={onDone}
          aria-label="End lesson"
          className="h-9 w-9 shrink-0 rounded-xl bg-sb-card2 text-base text-sb-ink hover:bg-sb-line"
        >
          ✕
        </button>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-sb-card2"
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuenow={quizProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-sb-accent transition-all"
            style={{ width: `${quizProgress}%` }}
          />
        </div>
        <span className="shrink-0 text-sm font-medium text-sb-muted">
          {remainingItems} {remainingItems === 1 ? "word" : "words"} left
        </span>
      </div>

      <div
        key={`${cur.itemId}:${cur.type}`}
        className={`sb-fade rounded-3xl p-7 text-center ${isMeaning ? "bg-sb-gold-soft" : "bg-sb-accent-soft"}`}
      >
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-sb-muted">
          {isMeaning ? "Что это значит? · Meaning" : "Напишите по-русски · Type in Russian"}
        </p>
        <div className="font-display text-4xl font-bold text-sb-ink">
          {isMeaning ? cur.item.stressed_form : cur.item.translation_primary}
        </div>
        {isMeaning && cur.item.audio_url && (
          <button
            onClick={() => new Audio(cur.item.audio_url!).play()}
            className="mt-3.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-sb-ink shadow"
          >
            ▶ прослушать · play
          </button>
        )}
      </div>

      {feedback === null ? (
        <div className="mt-5">
          {isMeaning ? (
            <input
              autoFocus
              aria-label="English meaning"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setNearMiss(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && !e.repeat && input && grade(false)}
              placeholder="english meaning"
              className="w-full rounded-xl border border-sb-line bg-sb-card px-3 py-3.5 text-center text-lg outline-none focus:border-sb-muted"
            />
          ) : (
            <ProductionInput
              value={input}
              onChange={(v) => {
                setInput(v);
                setNearMiss(false);
              }}
              onSubmit={() => grade(false)}
              layout={kbLayout}
              onToggleLayout={toggleKb}
            />
          )}

          {nearMiss && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-sb-gold-soft px-3.5 py-2.5 text-sm text-sb-gold-ink">
              <span>Почти! Попробуйте ещё · Almost!</span>
              <button onClick={() => grade(true)} className="font-bold underline">
                засчитать · accept
              </button>
            </div>
          )}

          {isMeaning && (
            <button
              onClick={() => input && grade(false)}
              disabled={!input}
              className="mt-3 w-full rounded-xl bg-sb-ink py-3 font-bold text-white disabled:opacity-40"
            >
              Проверить · Check
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 text-center">
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl px-4 py-3 text-lg font-bold ${
              feedback.correct ? "bg-[#DCEFE0] text-[#2E6B45]" : "bg-[#F5DAD8] text-[#A83B33]"
            }`}
          >
            {feedback.correct ? "Верно · Correct" : "Не совсем · You'll see this again"}
          </div>
          <div className="mt-4 font-display text-4xl font-bold text-sb-ink">{feedback.expected}</div>
          <button
            autoFocus
            onClick={next}
            className={`mt-5 w-full rounded-xl py-3 font-bold text-white ${
              feedback.correct ? "bg-[#2E6B45]" : "bg-[#A83B33]"
            }`}
          >
            Дальше · Continue
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-24 max-w-md px-6 text-center text-sb-muted">{children}</div>;
}

function HomeLink({ onDone }: { onDone: () => void }) {
  return (
    <button onClick={onDone} className="mt-4 block w-full text-sb-muted underline">
      back home
    </button>
  );
}
