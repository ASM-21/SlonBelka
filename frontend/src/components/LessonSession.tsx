import { useEffect, useMemo, useRef, useState } from "react";
import SessionSummary from "./SessionSummary";
import { completeLessons, getLessons, LessonItem } from "../lib/api";
import { gradeMeaning, gradeProduction } from "../lib/grading";
import CyrillicKeyboard from "./CyrillicKeyboard";

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
  // Shuffle so the order is not predictable (Fisher-Yates).
  for (let i = qs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [qs[i], qs[j]] = [qs[j], qs[i]];
  }
  return qs;
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
      <div className="mx-auto mt-16 w-full max-w-md px-6 text-center">
        <p className="mb-2 text-sm text-neutral-400">
          New word {infoIdx + 1} of {items.length}
        </p>
        <div className="rounded-2xl border border-neutral-200 p-8">
          <div className="mb-3 text-5xl">{item.stressed_form}</div>
          <div className="text-xl text-neutral-700">{item.translation_primary}</div>
          {item.translations.length > 1 && (
            <div className="mt-1 text-sm text-neutral-400">
              also: {item.translations.filter((t) => t !== item.translation_primary).join(", ")}
            </div>
          )}
          <div className="mt-2 text-sm text-neutral-400">
            {[item.part_of_speech, item.gender, item.aspect].filter(Boolean).join(" · ")}
          </div>
          {item.audio_url && (
            <button
              onClick={() => new Audio(item.audio_url!).play()}
              className="mt-4 rounded-full bg-neutral-100 px-3 py-1 text-sm"
            >
              ▶ play
            </button>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => setInfoIdx((i) => Math.max(0, i - 1))}
            disabled={infoIdx === 0}
            className="rounded-lg px-4 py-2 text-neutral-500 disabled:opacity-30"
          >
            back
          </button>
          {last ? (
            <button
              onClick={() => {
                setQueue(buildQueue(items));
                setPhase("quiz");
              }}
              className="rounded-lg bg-neutral-900 px-5 py-2 font-medium text-white"
            >
              Start quiz
            </button>
          ) : (
            <button
              onClick={() => setInfoIdx((i) => i + 1)}
              className="rounded-lg bg-neutral-900 px-5 py-2 font-medium text-white"
            >
              next
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
        title="Lesson complete"
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
    <div className="mx-auto mt-12 w-full max-w-md px-5">
      <p className="mb-3 text-center text-sm text-neutral-400">
        {remainingItems} {remainingItems === 1 ? "word" : "words"} left to clear
      </p>

      <div className={`rounded-2xl p-6 text-center ${isMeaning ? "bg-sky-50" : "bg-amber-50"}`}>
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
          {isMeaning ? "What does this mean?" : "Type in Russian"}
        </p>
        <div className="text-4xl">{isMeaning ? cur.item.stressed_form : cur.item.translation_primary}</div>
        {isMeaning && cur.item.audio_url && (
          <button
            onClick={() => new Audio(cur.item.audio_url!).play()}
            className="mt-3 rounded-full bg-white px-3 py-1 text-sm shadow"
          >
            ▶ play
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
              onKeyDown={(e) => e.key === "Enter" && input && grade(false)}
              placeholder="english meaning"
              className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-center text-lg"
            />
          ) : (
            <>
              <div className="mb-3 min-h-[3rem] rounded-lg border border-neutral-300 px-3 py-3 text-center text-2xl">
                {input || <span className="text-neutral-300">...</span>}
              </div>
              <CyrillicKeyboard
                onKey={(c) => {
                  setInput((i) => i + c);
                  setNearMiss(false);
                }}
                onBackspace={() => setInput((i) => i.slice(0, -1))}
                onSubmit={() => input && grade(false)}
              />
            </>
          )}

          {nearMiss && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-yellow-100 px-3 py-2 text-sm">
              <span>Close. Try again,</span>
              <button onClick={() => grade(true)} className="font-medium underline">
                or mark correct
              </button>
            </div>
          )}

          {isMeaning && (
            <button
              onClick={() => input && grade(false)}
              disabled={!input}
              className="mt-3 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white disabled:opacity-40"
            >
              Submit
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 text-center">
          <div
            className={`rounded-lg px-4 py-3 text-lg font-medium ${
              feedback.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {feedback.correct ? "Correct" : "Not quite — you'll see this again"}
          </div>
          <div className="mt-4 text-3xl">{feedback.expected}</div>
          <button
            autoFocus
            onClick={next}
            className="mt-5 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white"
          >
            continue
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-24 max-w-md px-6 text-center text-neutral-600">{children}</div>;
}

function HomeLink({ onDone }: { onDone: () => void }) {
  return (
    <button onClick={onDone} className="mt-4 block w-full text-neutral-500 underline">
      back home
    </button>
  );
}
