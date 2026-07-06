import { useEffect, useMemo, useRef, useState } from "react";
import SessionSummary from "./SessionSummary";
import { completeLessons, getLessons, LessonItem } from "../lib/api";
import { gradeMeaning, gradeProduction } from "../lib/grading";
import { shuffle, spreadPairs } from "../lib/shuffle";
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
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [nearMiss, setNearMiss] = useState(false);
  const [summary, setSummary] = useState<{ started: number } | null>(null);
  const quizStats = useRef({ first: new Map<string, boolean>() });

  useEffect(() => {
    getLessons().then(setItems).catch(() => setItems([]));
  }, []);

  const remainingItems = useMemo(
    () => new Set(queue.map((q) => q.itemId)).size,
    [queue],
  );

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
      <div className="mx-auto mt-10 w-full max-w-md px-6 text-center">
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
          {last ? (
            <button
              onClick={() => {
                setQueue(buildQueue(items));
                setPhase("quiz");
              }}
              className="flex-1 rounded-xl bg-sb-ink px-5 py-3 font-bold text-white"
            >
              Начать квиз · Start quiz
            </button>
          ) : (
            <button
              onClick={() => setInfoIdx((i) => i + 1)}
              className="flex-1 rounded-xl bg-sb-ink px-5 py-3 font-bold text-white"
            >
              Далее · Next
            </button>
          )}
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
        onDone={onDone}
      />
    );
  }

  // ---- quiz phase ----
  const cur = queue[0];
  const isMeaning = cur.type === "meaning";

  const commit = async () => {
    setPhase("committing");
    try {
      const res = await completeLessons(items.map((i) => i.id));
      setSummary({ started: res.started.length });
    } catch {
      setSummary({ started: 0 });
    }
    setPhase("done");
  };

  const grade = (override: boolean) => {
    const g = override
      ? "correct"
      : isMeaning
        ? gradeMeaning(input, cur.item.translations.length ? cur.item.translations : [cur.item.translation_primary])
        : gradeProduction(input, cur.item.lemma);

    if (g === "near_miss") {
      setNearMiss(true);
      return;
    }
    setNearMiss(false);
    const key = `${cur.item.id}:${cur.type}`;
    if (!quizStats.current.first.has(key)) quizStats.current.first.set(key, g === "correct");
    setFeedback({
      correct: g === "correct",
      expected: isMeaning ? cur.item.translation_primary : cur.item.stressed_form,
    });
  };

  const next = async () => {
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

  return (
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <p className="mb-3 text-center text-sm font-medium text-sb-muted">
        {remainingItems} {remainingItems === 1 ? "word" : "words"} left to clear
      </p>

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
            />
          )}

          {nearMiss && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-sb-gold-soft px-3.5 py-2.5 text-sm text-[#7A5F1E]">
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
            className="mt-5 w-full rounded-xl bg-sb-ink py-3 font-bold text-white"
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
