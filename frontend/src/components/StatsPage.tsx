import { getStats } from "../lib/api";
import { BAND_LABELS } from "../lib/labels";
import { useFetch } from "../lib/useFetch";

const BAND_COLOR: Record<string, string> = {
  apprentice: "bg-pink-400",
  guru: "bg-purple-400",
  master: "bg-blue-400",
  enlightened: "bg-indigo-400",
  burned: "bg-neutral-700",
};

export default function StatsPage({ onDone }: { onDone: () => void }) {
  const { status, data: s, retry } = useFetch(getStats);

  if (status === "loading") return <Centered onDone={onDone}>loading stats...</Centered>;
  if (status === "error" || !s)
    return (
      <Centered onDone={onDone}>
        Couldn't load stats.
        <button
          onClick={retry}
          className="mt-4 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white"
        >
          Retry
        </button>
      </Centered>
    );

  const maxDay = Math.max(1, ...s.reviews_by_day.map((d) => d.count));
  const distTotal = Math.max(1, ...[Object.values(s.srs_distribution).reduce((a, b) => a + b, 0)]);
  const acc = s.totals.accuracy != null ? `${Math.round(s.totals.accuracy * 100)}%` : "—";

  return (
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Stats</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          done
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Reviews" value={String(s.totals.total_reviews)} />
        <Stat label="Accuracy" value={acc} />
        <Stat label="Current streak" value={`${s.totals.current_streak}d`} />
        <Stat label="Longest streak" value={`${s.totals.longest_streak}d`} />
        <Stat label="Words started" value={String(s.totals.items_started)} />
        <Stat label="Words burned" value={String(s.totals.items_burned)} />
      </div>

      <h3 className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Reviews, last 30 days
      </h3>
      <div className="flex h-28 items-end gap-[2px]">
        {s.reviews_by_day.map((d) => (
          <div key={d.date} className="flex-1" title={`${d.date}: ${d.count} (${d.correct} correct)`}>
            <div
              className="w-full rounded-t bg-neutral-300"
              style={{ height: `${(d.count / maxDay) * 100}%` }}
            >
              <div
                className="w-full rounded-t bg-emerald-500"
                style={{ height: d.count ? `${(d.correct / d.count) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-neutral-400">Green is the correct portion of each day.</p>

      <h3 className="mb-2 mt-8 text-xs font-medium uppercase tracking-wide text-neutral-400">
        SRS distribution
      </h3>
      <div className="space-y-2">
        {Object.entries(s.srs_distribution).map(([band, n]) => (
          <div key={band} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-neutral-600">{BAND_LABELS[band] ?? band}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
              <div
                className={`h-full ${BAND_COLOR[band] ?? "bg-neutral-400"}`}
                style={{ width: `${(n / distTotal) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-neutral-500">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
    </div>
  );
}

function Centered({ children, onDone }: { children: React.ReactNode; onDone: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md px-6 text-center text-neutral-600">
      {children}
      <button onClick={onDone} className="mt-4 block w-full text-neutral-500 underline">
        back home
      </button>
    </div>
  );
}
