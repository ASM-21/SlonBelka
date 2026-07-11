import { useEffect, useState } from "react";
import { getSettings, practice, ReviewItem, updateSettings } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Layout } from "./CyrillicKeyboard";
import ProductionInput from "./ProductionInput";

/**
 * No-stakes practice over a fixed set of prompts. Used for leech training and
 * extra study. Grades via /practice, which never records or reschedules.
 */
export default function PracticeSession({
  items,
  title,
  onDone,
}: {
  items: ReviewItem[];
  title: string;
  onDone: () => void;
}) {
  const [queue, setQueue] = useState<ReviewItem[]>(items);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; expected: string; stressed: string } | null>(null);

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

  const submit = async () => {
    const cur = queue[0];
    if (!cur || feedback !== null) return;
    try {
      const res = await practice(cur.item_id, cur.question_type, input);
      setFeedback({ correct: res.correct, expected: res.expected, stressed: res.stressed_form });
    } catch {
      /* keep the input; the user can submit again */
    }
  };

  const cont = () => {
    if (queue.length === 0) return;
    const correct = feedback?.correct ?? false;
    setQueue((q) => {
      const [first, ...rest] = q;
      return correct ? rest : [...rest, first];
    });
    setInput("");
    setFeedback(null);
  };

  // Enter drives practice even when nothing is focused: submit the typed
  // answer, advance from feedback. Skipped while focus is in a field or on a
  // button, whose native click already fires on Enter.
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
      if (feedback !== null) cont();
      else if (input) submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (queue.length === 0)
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center text-sb-muted">
        Практика завершена · Practice done.
        <button onClick={onDone} className="mt-4 block w-full text-sb-muted underline">
          back
        </button>
      </div>
    );

  const cur = queue[0];
  const isMeaning = cur.question_type === "meaning";

  return (
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <p className="mb-3 text-center text-sm font-medium text-sb-muted">
        {title} · {queue.length} left
      </p>

      <div
        key={`${cur.item_id}:${cur.question_type}`}
        className={`sb-fade rounded-3xl p-7 text-center ${isMeaning ? "bg-sb-gold-soft" : "bg-sb-accent-soft"}`}
      >
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-sb-muted">
          {isMeaning ? "Что это значит? · Meaning" : "Напишите по-русски · Type in Russian"}
        </p>
        <div className="font-display text-4xl font-bold text-sb-ink">{cur.prompt}</div>
      </div>

      {feedback === null ? (
        <div className="mt-5">
          {isMeaning ? (
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.repeat && input && submit()}
              placeholder="english meaning"
              className="w-full rounded-xl border border-sb-line bg-sb-card px-3 py-3.5 text-center text-lg outline-none focus:border-sb-muted"
            />
          ) : (
            <ProductionInput
              value={input}
              onChange={setInput}
              onSubmit={() => input && submit()}
              layout={kbLayout}
              onToggleLayout={toggleKb}
            />
          )}
          {isMeaning && (
            <button
              onClick={() => input && submit()}
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
            {feedback.correct ? "Верно · Correct" : "Не совсем · Not quite"}
          </div>
          <div className="mt-4 font-display text-4xl font-bold text-sb-ink">{feedback.stressed}</div>
          <div className="mt-1 text-sb-muted">{feedback.expected}</div>
          <button
            autoFocus
            onClick={cont}
            className={`mt-6 w-full rounded-xl py-3 font-bold text-white ${
              feedback.correct ? "bg-[#2E6B45]" : "bg-[#A83B33]"
            }`}
          >
            Дальше · Continue
          </button>
        </div>
      )}

      <button onClick={onDone} className="mt-4 block w-full text-center text-sm text-sb-muted hover:text-sb-ink">
        завершить · end practice
      </button>
    </div>
  );
}
