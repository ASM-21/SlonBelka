import { useEffect, useRef, useState } from "react";
import { addSynonym, getReviews, ReviewItem, submitReview, SubmitResult } from "../lib/api";
import { shuffle, spreadPairs } from "../lib/shuffle";
import { enqueue } from "../lib/offlineQueue";
import { drainQueue } from "../lib/sync";
import CyrillicKeyboard from "./CyrillicKeyboard";
import SessionSummary from "./SessionSummary";

type Phase = "answering" | "feedback" | "offline";

export default function ReviewSession({ onDone }: { onDone: () => void }) {
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("answering");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [nearMiss, setNearMiss] = useState(false);
  const [pending, setPending] = useState(0);
  const [synAdded, setSynAdded] = useState(false);

  // Session outcomes, accumulated without forcing re-renders; read at the end.
  const stats = useRef({
    reviewed: new Set<number>(),
    first: new Map<string, boolean>(), // item:type -> first-attempt correct
    passed: 0,
    burned: 0,
    levelUp: null as number | null,
  });

  useEffect(() => {
    // Shuffle so the order is unpredictable, then spread so a word's two
    // question types are not back to back (the server sends them adjacent).
    getReviews()
      .then((q) => setQueue(spreadPairs(shuffle(q), (r) => r.item_id)))
      .catch(() => setQueue([]));
  }, []);

  // When the session empties, push anything that was queued offline.
  useEffect(() => {
    if (queue && queue.length === 0 && pending > 0) drainQueue();
  }, [queue, pending]);

  if (queue === null) return <Centered>loading reviews...</Centered>;
  if (queue.length === 0) {
    const st = stats.current;
    const totalQ = st.first.size;
    if (totalQ === 0 && pending === 0)
      return (
        <Centered>
          Nothing due right now.
          <button onClick={onDone} className="mt-4 block w-full text-neutral-500 underline">
            back home
          </button>
        </Centered>
      );
    const correctQ = [...st.first.values()].filter(Boolean).length;
    const acc = totalQ ? Math.round((correctQ / totalQ) * 100) : null;
    const highlights: string[] = [];
    if (st.levelUp) highlights.push(`Leveled up to ${st.levelUp}`);
    if (st.passed > 0) highlights.push(`${st.passed} reached Guru`);
    if (st.burned > 0) highlights.push(`${st.burned} burned`);
    return (
      <SessionSummary
        title="Reviews complete"
        stats={[
          { label: "Reviewed", value: String(st.reviewed.size) },
          { label: "Accuracy", value: acc != null ? `${acc}%` : "—" },
          { label: "Answers", value: String(totalQ) },
        ]}
        highlights={highlights}
        note={pending > 0 ? `${pending} answered offline. They'll sync when you're back online.` : undefined}
        onDone={onDone}
      />
    );
  }

  const cur = queue[0];
  const isMeaning = cur.question_type === "meaning";

  const send = async (override: boolean) => {
    const clientEventId = crypto.randomUUID();
    const answeredAt = new Date().toISOString();
    try {
      const res = await submitReview({
        item_id: cur.item_id,
        question_type: cur.question_type,
        answer: input,
        client_event_id: clientEventId,
        override,
      });
      if (res.status === "near_miss") {
        setNearMiss(true);
        return;
      }
      setNearMiss(false);
      setResult(res);
      setPhase("feedback");

      // Record session outcomes (first attempt per question for accuracy).
      const st = stats.current;
      st.reviewed.add(cur.item_id);
      const key = `${cur.item_id}:${cur.question_type}`;
      if (!st.first.has(key)) st.first.set(key, res.correct);
      if (res.passed) st.passed += 1;
      if (res.burned) st.burned += 1;
      if (res.leveled_up && res.current_level) st.levelUp = res.current_level;
    } catch {
      // Offline or the request failed: queue the answer for sync and move on.
      // Reviews don't ship the answer, so grading stays server-side; offline we
      // just record it and advance without revealing correctness.
      await enqueue({
        item_id: cur.item_id,
        question_type: cur.question_type,
        answer: input,
        client_event_id: clientEventId,
        answered_at: answeredAt,
        override: override ?? false,
      });
      setNearMiss(false);
      setPending((p) => p + 1);
      setPhase("offline");
    }
  };

  const cont = () => {
    const wasCorrect = result?.correct ?? false;
    setQueue((q) => {
      if (!q) return q;
      const [first, ...rest] = q;
      return wasCorrect ? rest : [...rest, first]; // re-quiz misses at the end
    });
    setInput("");
    setResult(null);
    setSynAdded(false);
    setPhase("answering");
  };

  const contOffline = () => {
    // We don't know correctness offline; drop the item and let a later online
    // /reviews fetch resurface anything that wasn't passed.
    setQueue((q) => (q ? q.slice(1) : q));
    setInput("");
    setPhase("answering");
  };

  return (
    <div className="mx-auto mt-12 w-full max-w-md px-5">
      <p className="mb-3 text-center text-sm text-neutral-400">
        {queue.length} in queue{pending > 0 ? ` · ${pending} to sync` : ""}
      </p>

      <div className={`rounded-2xl p-6 text-center ${isMeaning ? "bg-sky-50" : "bg-amber-50"}`}>
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
          {isMeaning ? "What does this mean?" : "Type in Russian"}
        </p>
        <div className="text-4xl">{cur.prompt}</div>
        {isMeaning && cur.audio_url && (
          <button
            onClick={() => new Audio(cur.audio_url!).play()}
            className="mt-3 rounded-full bg-white px-3 py-1 text-sm shadow"
          >
            ▶ play
          </button>
        )}
      </div>

      {phase === "answering" ? (
        <div className="mt-5">
          {isMeaning ? (
            <input
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setNearMiss(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && input && send(false)}
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
                onSubmit={() => input && send(false)}
              />
            </>
          )}

          {nearMiss && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-yellow-100 px-3 py-2 text-sm">
              <span>Close. Try again,</span>
              <button onClick={() => send(true)} className="font-medium underline">
                or mark correct
              </button>
            </div>
          )}

          {isMeaning && (
            <button
              onClick={() => input && send(false)}
              disabled={!input}
              className="mt-3 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white disabled:opacity-40"
            >
              Submit
            </button>
          )}
        </div>
      ) : phase === "offline" ? (
        <div className="mt-5 text-center">
          <div className="rounded-lg bg-amber-100 px-4 py-3 text-amber-800">
            Saved offline. It will sync when you reconnect.
          </div>
          <button
            onClick={contOffline}
            className="mt-6 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="mt-5 text-center">
          <div
            className={`rounded-lg px-4 py-3 text-lg font-medium ${
              result?.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {result?.correct ? "Correct" : "Not quite"}
          </div>
          <div className="mt-4 text-3xl">{result?.stressed_form}</div>
          <div className="mt-1 text-neutral-600">{result?.expected}</div>
          {result?.passed && <div className="mt-2 text-sm text-green-700">Reached Guru</div>}
          {isMeaning && result && !result.correct && input.trim() && (
            synAdded ? (
              <p className="mt-3 text-sm text-emerald-600">Added "{input.trim()}" as a synonym.</p>
            ) : (
              <button
                onClick={async () => {
                  await addSynonym(cur.item_id, input.trim());
                  setSynAdded(true);
                }}
                className="mt-3 text-sm text-neutral-600 underline hover:text-neutral-900"
              >
                Accept "{input.trim()}" next time
              </button>
            )
          )}
          {result?.leveled_up && (
            <div className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
              Level up. You are now level {result.current_level}.
            </div>
          )}
          <button
            onClick={cont}
            className="mt-6 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-24 max-w-md px-6 text-center text-neutral-600">{children}</div>;
}
