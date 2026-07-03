import { useState } from "react";
import { practice, ReviewItem } from "../lib/api";
import CyrillicKeyboard from "./CyrillicKeyboard";

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

  if (queue.length === 0)
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center text-neutral-600">
        Practice done.
        <button onClick={onDone} className="mt-4 block w-full text-neutral-500 underline">
          back
        </button>
      </div>
    );

  const cur = queue[0];
  const isMeaning = cur.question_type === "meaning";

  const submit = async () => {
    const res = await practice(cur.item_id, cur.question_type, input);
    setFeedback({ correct: res.correct, expected: res.expected, stressed: res.stressed_form });
  };

  const cont = () => {
    const correct = feedback?.correct ?? false;
    setQueue((q) => {
      const [first, ...rest] = q;
      return correct ? rest : [...rest, first];
    });
    setInput("");
    setFeedback(null);
  };

  return (
    <div className="mx-auto mt-12 w-full max-w-md px-5">
      <p className="mb-3 text-center text-sm text-neutral-400">
        {title} · {queue.length} left
      </p>

      <div className={`rounded-2xl p-6 text-center ${isMeaning ? "bg-sky-50" : "bg-amber-50"}`}>
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
          {isMeaning ? "What does this mean?" : "Type in Russian"}
        </p>
        <div className="text-4xl">{cur.prompt}</div>
      </div>

      {feedback === null ? (
        <div className="mt-5">
          {isMeaning ? (
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && input && submit()}
              placeholder="english meaning"
              className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-center text-lg"
            />
          ) : (
            <>
              <div className="mb-3 min-h-[3rem] rounded-lg border border-neutral-300 px-3 py-3 text-center text-2xl">
                {input || <span className="text-neutral-300">...</span>}
              </div>
              <CyrillicKeyboard
                onKey={(c) => setInput((i) => i + c)}
                onBackspace={() => setInput((i) => i.slice(0, -1))}
                onSubmit={() => input && submit()}
              />
            </>
          )}
          {isMeaning && (
            <button
              onClick={() => input && submit()}
              disabled={!input}
              className="mt-3 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white disabled:opacity-40"
            >
              Check
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
            {feedback.correct ? "Correct" : "Not quite"}
          </div>
          <div className="mt-4 text-3xl">{feedback.stressed}</div>
          <div className="mt-1 text-neutral-600">{feedback.expected}</div>
          <button onClick={cont} className="mt-6 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white">
            Continue
          </button>
        </div>
      )}

      <button onClick={onDone} className="mt-4 block w-full text-center text-sm text-neutral-400">
        end practice
      </button>
    </div>
  );
}
