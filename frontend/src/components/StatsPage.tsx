import { getStats } from "../lib/api";
import { BAND_LABELS, BAND_LABELS_RU } from "../lib/labels";
import { useFetch } from "../lib/useFetch";

const BAND_COLOR: Record<string, string> = {
  apprentice: "bg-sb-appr",
  guru: "bg-sb-guru",
  master: "bg-sb-master",
  enlightened: "bg-sb-enl",
  burned: "bg-sb-burned",
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
          className="mt-4 w-full rounded-xl bg-sb-ink py-2.5 font-bold text-white"
        >
          Retry
        </button>
      </Centered>
    );

  const maxDay = Math.max(1, ...s.reviews_by_day.map((d) => d.count));
  const acc = s.totals.accuracy != null ? `${Math.round(s.totals.accuracy * 100)}%` : "—";

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold leading-none text-sb-ink">Статистика</h2>
          <div className="text-xs text-sb-muted">Statistics</div>
        </div>
        <button
          onClick={onDone}
          className="rounded-xl bg-sb-card2 px-3.5 py-2 text-[13px] font-semibold text-sb-ink"
        >
          готово · done
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Повторений · Reviews" value={String(s.totals.total_reviews)} />
        <Stat label="Точность · Accuracy" value={acc} />
        <Stat label="Текущая серия · Streak" value={`${s.totals.current_streak}д`} />
        <Stat label="Рекорд · Best streak" value={`${s.totals.longest_streak}д`} />
        <Stat label="Слов начато · Started" value={String(s.totals.items_started)} />
        <Stat label="Сожжено · Burned" value={String(s.totals.items_burned)} />
      </div>

      <h3 className="mb-3 mt-7 text-xs font-bold uppercase tracking-wider text-sb-muted">
        Повторения, 30 дней · Reviews, 30 days
      </h3>
      <div className="flex h-28 items-end gap-[3px]">
        {s.reviews_by_day.map((d) => (
          <div key={d.date} className="flex-1" title={`${d.date}: ${d.count} (${d.correct} correct)`}>
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t bg-sb-card2"
              style={{ height: `${(d.count / maxDay) * 100}%` }}
            >
              <div
                className="w-full bg-sb-accent"
                style={{ height: d.count ? `${(d.correct / d.count) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-sb-muted">
        Оранжевым — верные ответы за день · orange = correct answers.
      </p>

      <h3 className="mb-3 mt-7 text-xs font-bold uppercase tracking-wider text-sb-muted">
        Распределение по этапам · Stage distribution
      </h3>
      <div className="space-y-2.5">
        {Object.entries(s.srs_distribution).map(([band, n]) => (
          <div key={band} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-28 font-semibold leading-tight text-sb-ink">
              {BAND_LABELS_RU[band] ?? band}
              <span className="block text-[11px] font-medium text-sb-muted">
                {BAND_LABELS[band] ?? band}
              </span>
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded-md bg-sb-card2">
              <div
                className={`h-full rounded-md ${BAND_COLOR[band] ?? "bg-sb-muted"}`}
                style={{
                  width: `${(n / Math.max(1, Object.values(s.srs_distribution).reduce((a, b) => a + b, 0))) * 100}%`,
                }}
              />
            </div>
            <span className="w-8 text-right font-semibold text-sb-muted">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-sb-line bg-sb-card px-4 py-3.5">
      <div className="font-display text-2xl font-extrabold text-sb-ink">{value}</div>
      <div className="text-xs text-sb-muted">{label}</div>
    </div>
  );
}

function Centered({ children, onDone }: { children: React.ReactNode; onDone: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md px-6 text-center text-sb-muted">
      {children}
      <button onClick={onDone} className="mt-4 block w-full text-sb-muted underline">
        back home
      </button>
    </div>
  );
}
