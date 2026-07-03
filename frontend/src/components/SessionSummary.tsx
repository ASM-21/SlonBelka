// Reusable end-of-session recap, shared by reviews and lessons.

interface StatCard {
  label: string;
  value: string;
}

export default function SessionSummary({
  title,
  subtitle,
  stats,
  highlights = [],
  note,
  onDone,
}: {
  title: string;
  subtitle?: string;
  stats: StatCard[];
  highlights?: string[];
  note?: string;
  onDone: () => void;
}) {
  return (
    <div className="mx-auto mt-16 w-full max-w-md px-6 text-center">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-neutral-500">{subtitle}</p>}

      <div className={`mt-6 grid gap-3 ${stats.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-neutral-200 px-3 py-4">
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="text-xs text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>

      {highlights.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {highlights.map((h) => (
            <span
              key={h}
              className="rounded-full bg-gradient-to-r from-amber-100 to-rose-100 px-3 py-1 text-sm font-medium text-rose-800"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {note && <p className="mt-4 text-sm text-amber-600">{note}</p>}

      <button
        onClick={onDone}
        className="mt-8 w-full rounded-lg bg-neutral-900 py-2.5 font-medium text-white"
      >
        Back home
      </button>
    </div>
  );
}
