import { useState } from "react";
import { getBurned, resurrect } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { PageHeader } from "./ui";

export default function BurnedPage({ onDone }: { onDone: () => void }) {
  const { status, data: items, setData: setItems, retry } = useFetch(getBurned);
  const [working, setWorking] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const doResurrect = async (id: number) => {
    setWorking(id);
    setNote(null);
    try {
      await resurrect(id);
      setItems((cur) => (cur ? cur.filter((i) => i.item_id !== id) : cur));
    } catch {
      setNote("Couldn't resurrect that word. Try again.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <PageHeader ru="Сожжённые" en="Burned" onBack={onDone} />
      <p className="mb-5 text-sm leading-relaxed text-sb-muted">
        Слова, доведённые до мастерства. · Mastered words that left the queue. Resurrect one to
        put it back into reviews at Apprentice 1.
      </p>

      {note && <p className="mb-3 rounded-xl bg-sb-accent-soft px-3 py-2 text-sm text-sb-accent2">{note}</p>}

      {status === "loading" ? (
        <p className="py-8 text-center text-sb-muted">loading...</p>
      ) : status === "error" || items === null ? (
        <p className="py-8 text-center text-sb-muted">
          Couldn't load burned items.{" "}
          <button onClick={retry} className="font-semibold text-sb-ink underline">
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sb-muted">Nothing burned yet. Keep going.</p>
      ) : (
        <div className="divide-y divide-sb-line">
          {items.map((it) => (
            <div key={it.item_id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-bold text-sb-ink">{it.stressed_form}</div>
                <div className="truncate text-sm text-sb-muted">
                  {it.translation_primary} · L{it.level}
                </div>
              </div>
              <button
                onClick={() => doResurrect(it.item_id)}
                disabled={working === it.item_id}
                className="ml-3 shrink-0 rounded-lg border border-sb-line bg-sb-card px-3 py-1.5 text-sm font-semibold text-sb-ink hover:border-sb-ink disabled:opacity-40"
              >
                {working === it.item_id ? "..." : "Resurrect"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
