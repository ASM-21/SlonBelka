import { useEffect, useRef, useState } from "react";
import { addSynonym, getReviews, getSettings, ReviewItem, submitReview, SubmitResult, updateSettings } from "../lib/api";
import { shuffle, spreadPairs } from "../lib/shuffle";
import { enqueue } from "../lib/offlineQueue";
import { drainQueue } from "../lib/sync";
import { useFetch } from "../lib/useFetch";
import { Layout } from "./CyrillicKeyboard";
import ItemInfoPanel from "./ItemInfoPanel";
import ProductionInput from "./ProductionInput";
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
  const [showInfo, setShowInfo] = useState(false);
  const [exited, setExited] = useState(false);
  const total = useRef(0);
  const sending = useRef(false);

  // On-screen keyboard layout: the saved setting, overridable in-session (the
  // toggle also persists the choice). State lives here so the per-question
  // remount of the input does not reset it.
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

  // Session outcomes, accumulated without forcing re-renders; read at the end.
  const stats = useRef({
    first: new Map<string, boolean>(), // item:type -> first-attempt correct
    cleared: new Map<number, boolean>(), // item_id -> passed with no misses this session
    passed: 0,
    burned: 0,
    levelUp: null as number | null,
  });

  useEffect(() => {
    // Shuffle so the order is unpredictable, then spread so a word's two
    // question types are not back to back (the server sends them adjacent).
    getReviews()
      .then((q) => {
        total.current = q.length;
        setQueue(spreadPairs(shuffle(q), (r) => r.item_id));
      })
      .catch(() => setQueue([]));
  }, []);

  // Push offline-queued answers once the session ends (empty queue or exit).
  useEffect(() => {
    if (pending > 0 && (exited || (queue && queue.length === 0))) drainQueue();
  }, [queue, pending, exited]);

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
    setShowInfo(false);
    setPhase("answering");
  };

  const send = async (override: boolean) => {
    const cur = queue?.[0];
    if (!cur || sending.current) return;
    sending.current = true;
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
      const key = `${cur.item_id}:${cur.question_type}`;
      if (!st.first.has(key)) st.first.set(key, res.correct);
      if (res.pass_complete) {
        // A word is clean only if nothing asked for it this session was missed.
        let clean = true;
        for (const [k, ok] of st.first) {
          if (k.startsWith(`${cur.item_id}:`) && !ok) clean = false;
        }
        st.cleared.set(cur.item_id, clean);
      }
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
    } finally {
      sending.current = false;
    }
  };

  const contOffline = () => {
    // We don't know correctness offline; drop the item and let a later online
    // /reviews fetch resurface anything that wasn't passed.
    setQueue((q) => (q ? q.slice(1) : q));
    setInput("");
    setShowInfo(false);
    setPhase("answering");
  };

  // Enter drives the session even when nothing is focused (auto-focus is not
  // guaranteed in every browser): it submits the typed answer, advances from
  // feedback, and continues after an offline save. Skipped while focus is in
  // a field (typing) or on a button, whose native click already fires on Enter.
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
      if (phase === "feedback") cont();
      else if (phase === "offline") contOffline();
      else if (input) send(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (queue === null) return <Centered>loading reviews...</Centered>;

  const st = stats.current;
  if (queue.length === 0 && !exited && st.first.size === 0 && pending === 0)
    return (
      <Centered>
        Nothing due right now.
        <button onClick={onDone} className="mt-4 block w-full text-sb-muted underline">
          back home
        </button>
      </Centered>
    );

  if (exited || queue.length === 0) {
    const clearedCount = st.cleared.size;
    const cleanCount = [...st.cleared.values()].filter(Boolean).length;
    const acc = clearedCount ? Math.round((cleanCount / clearedCount) * 100) : null;
    const highlights: string[] = [];
    if (st.levelUp) highlights.push(`Leveled up to ${st.levelUp}`);
    if (st.passed > 0) highlights.push(`${st.passed} reached Guru`);
    if (st.burned > 0) highlights.push(`${st.burned} burned`);
    const endedEarly = exited && queue.length > 0;
    const notes: string[] = [];
    if (endedEarly)
      notes.push(`Ended early with ${queue.length} in the queue. Every submitted answer was saved.`);
    if (pending > 0) notes.push(`${pending} answered offline. They'll sync when you're back online.`);
    return (
      <SessionSummary
        title={endedEarly ? "Сессия завершена · Session ended" : "Повторения завершены · Reviews done"}
        subtitle="A word counts once both its questions are cleared."
        stats={[
          { label: "Words cleared", value: String(clearedCount) },
          { label: "Accuracy", value: acc != null ? `${acc}%` : "—" },
          { label: "Answers", value: String(st.first.size) },
        ]}
        highlights={highlights}
        note={notes.join(" ") || undefined}
        onDone={onDone}
      />
    );
  }

  const cur = queue[0];
  const isMeaning = cur.question_type === "meaning";
  const progress = total.current > 0 ? Math.round(((total.current - queue.length) / total.current) * 100) : 0;

  const exitSession = () => {
    if (st.first.size === 0 && pending === 0) {
      onDone();
      return;
    }
    setExited(true);
  };

  return (
    <div className="mx-auto mt-6 w-full max-w-md px-5">
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={exitSession}
          aria-label="End session"
          className="h-9 w-9 shrink-0 rounded-xl bg-sb-card2 text-base text-sb-ink hover:bg-sb-line"
        >
          ✕
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sb-card2">
          <div
            className="h-full rounded-full bg-sb-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-sm font-medium text-sb-muted">
          {queue.length} left{pending > 0 ? ` · ${pending} to sync` : ""}
        </span>
      </div>

      <div key={`${cur.item_id}:${cur.question_type}`} className="sb-fade">
        <div
          className={`rounded-3xl p-7 text-center ${isMeaning ? "bg-sb-gold-soft" : "bg-sb-accent-soft"}`}
        >
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-sb-muted">
            {isMeaning ? "Что это значит? · Meaning" : "Напишите по-русски · Type in Russian"}
          </p>
          <div className="font-display text-4xl font-bold text-sb-ink">{cur.prompt}</div>
          {isMeaning && cur.audio_url && (
            <button
              onClick={() => new Audio(cur.audio_url!).play()}
              className="mt-3.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-sb-ink shadow"
            >
              ▶ прослушать · play
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
                onKeyDown={(e) => e.key === "Enter" && !e.repeat && input && send(false)}
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
                onSubmit={() => send(false)}
                layout={kbLayout}
                onToggleLayout={toggleKb}
              />
            )}

            {nearMiss && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-sb-gold-soft px-3.5 py-2.5 text-sm text-sb-gold-ink">
                <span>Почти! Попробуйте ещё · Almost!</span>
                <button onClick={() => send(true)} className="font-bold underline">
                  засчитать · accept
                </button>
              </div>
            )}

            {isMeaning && (
              <button
                onClick={() => input && send(false)}
                disabled={!input}
                className="mt-3 w-full rounded-xl bg-sb-ink py-3 font-bold text-white disabled:opacity-40"
              >
                Проверить · Check
              </button>
            )}
          </div>
        ) : phase === "offline" ? (
          <div className="mt-5 text-center">
            <div className="rounded-xl bg-sb-gold-soft px-4 py-3 text-sb-gold-ink">
              Saved offline. It will sync when you reconnect.
            </div>
            <button
              autoFocus
              onClick={contOffline}
              className="mt-6 w-full rounded-xl bg-sb-ink py-3 font-bold text-white"
            >
              Дальше · Continue
            </button>
          </div>
        ) : (
          <div className="mt-5 text-center">
            <input
              disabled
              value={input}
              className={`w-full rounded-xl border-2 px-3 py-3 text-center ${
                isMeaning ? "text-lg" : "text-2xl"
              } ${
                result?.correct
                  ? "border-[#2E6B45] bg-[#DCEFE0] text-[#2E6B45]"
                  : "border-[#A83B33] bg-[#F5DAD8] text-[#A83B33]"
              }`}
            />
            <p
              className={`mt-2 text-sm font-bold ${
                result?.correct ? "text-[#2E6B45]" : "text-[#A83B33]"
              }`}
            >
              {result?.correct ? "Верно · Correct" : "Не совсем · Not quite"}
            </p>
            <div className="mt-3 font-display text-4xl font-bold text-sb-ink">{result?.stressed_form}</div>
            <div className="mt-1 text-sb-muted">{result?.expected}</div>
            {result && <StageChip r={result} />}
            {result?.passed && (
              <div className="mt-2 text-sm font-semibold text-sb-gold">Гуру! · Reached Guru</div>
            )}
            {isMeaning && result && !result.correct && input.trim() && (
              synAdded ? (
                <p className="mt-3 text-sm text-emerald-600">Added "{input.trim()}" as a synonym.</p>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      await addSynonym(cur.item_id, input.trim());
                      setSynAdded(true);
                    } catch {
                      /* button stays for another try */
                    }
                  }}
                  className="mt-3 text-sm text-sb-muted underline hover:text-sb-ink"
                >
                  Accept "{input.trim()}" next time
                </button>
              )
            )}
            {result?.leveled_up && (
              <div className="mt-3 rounded-xl bg-sb-accent-soft px-3 py-2.5 text-sm font-bold text-sb-accent">
                Новый уровень! · Level up! You are now level {result.current_level}.
              </div>
            )}

            {showInfo ? (
              <ItemInfoPanel itemId={cur.item_id} />
            ) : (
              <button
                onClick={() => setShowInfo(true)}
                className="mt-3 text-sm text-sb-muted underline hover:text-sb-ink"
              >
                Подробнее · Show details
              </button>
            )}

            <button
              autoFocus
              onClick={cont}
              className={`mt-6 w-full rounded-xl py-3 font-bold text-white ${
                result?.correct ? "bg-[#2E6B45]" : "bg-[#A83B33]"
              }`}
            >
              Дальше · Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StageChip({ r }: { r: SubmitResult }) {
  // The stage only moves when both question types of the word are cleared.
  if (!r.pass_complete) return null;
  if (r.srs_stage > r.srs_stage_before)
    return (
      <div className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
        {r.srs_stage_before_name} → {r.srs_stage_name}
      </div>
    );
  const reason = "missed earlier in this review";
  return (
    <div className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
      {r.srs_stage < r.srs_stage_before
        ? `Dropped to ${r.srs_stage_name} · ${reason}`
        : `Stayed at ${r.srs_stage_name} · ${reason}`}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-24 max-w-md px-6 text-center text-sb-muted">{children}</div>;
}
