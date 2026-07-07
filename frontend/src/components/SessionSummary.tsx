// Reusable end-of-session recap, shared by reviews and lessons.

import { MascotPlaceholder } from "./ui";

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
    <div className="mx-auto mt-10 w-full max-w-md px-6 text-center">
      <div className="mb-4 flex justify-center">
        <MascotPlaceholder label="celebration" />
      </div>
      <h2 className="font-display text-3xl font-extrabold leading-tight text-sb-ink">{title}</h2>
      {subtitle && <p className="mt-1.5 text-[15px] text-sb-muted">{subtitle}</p>}

      <div className={`mt-6 grid gap-3 ${stats.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-sb-line bg-sb-card px-3 py-4">
            <div className="font-display text-2xl font-extrabold text-sb-ink">{s.value}</div>
            <div className="text-xs text-sb-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {highlights.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {highlights.map((h) => (
            <span
              key={h}
              className="rounded-full bg-sb-gold-soft px-3 py-1 text-sm font-semibold text-[#7A5F1E]"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {note && <p className="mt-4 text-sm text-[#7A5F1E]">{note}</p>}

      <button
        onClick={onDone}
        className="mt-8 w-full rounded-xl bg-sb-accent py-3.5 font-bold text-white shadow-lg shadow-sb-accent/30"
      >
        На главную · Home
      </button>
    </div>
  );
}
