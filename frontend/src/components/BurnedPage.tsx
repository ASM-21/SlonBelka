import { useState } from "react";
import { getBurned, resurrect } from "../lib/api";
import { useFetch } from "../lib/useFetch";

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
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Burned items</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          done
        </button>
      </div>
      <p className="mb-5 text-sm text-neutral-500">
        Retired words you've fully learned. Resurrect one to put it back into reviews at Apprentice 1.
      </p>

      {note && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{note}</p>}

      {status === "loading" ? (
        <p className="py-8 text-center text-neutral-400">loading...</p>
      ) : status === "error" || items === null ? (
        <p className="py-8 text-center text-neutral-400">
          Couldn't load burned items.{" "}
          <button onClick={retry} className="font-medium text-neutral-700 underline">
            Retry
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-neutral-400">Nothing burned yet. Keep going.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {items.map((it) => (
            <div key={it.item_id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="truncate text-lg">{it.stressed_form}</div>
                <div className="truncate text-sm text-neutral-500">
                  {it.translation_primary} · L{it.level}
                </div>
              </div>
              <button
                onClick={() => doResurrect(it.item_id)}
                disabled={working === it.item_id}
                className="ml-3 shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-neutral-900 disabled:opacity-40"
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
