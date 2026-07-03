import { useEffect, useState } from "react";
import { Dashboard, getDashboard, logout as apiLogout } from "../lib/api";

export default function Home({
  onStartLessons,
  onStartReviews,
  onOpenLeeches,
  onBrowse,
  onExtraStudy,
  onSettings,
  onUpgrade,
  onBurned,
  onStats,
  onLogout,
}: {
  onStartLessons: () => void;
  onStartReviews: () => void;
  onOpenLeeches: () => void;
  onBrowse: () => void;
  onExtraStudy: () => void;
  onSettings: () => void;
  onUpgrade: () => void;
  onBurned: () => void;
  onStats: () => void;
  onLogout: () => void;
}) {
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    getDashboard().then(setD).catch(() => setD(null));
  }, []);

  const logout = async () => {
    await apiLogout();
    onLogout();
  };

  const lp = d?.level_progress;
  const progressPct = lp && lp.threshold > 0 ? Math.min(100, (lp.fraction / lp.threshold) * 100) : 0;

  return (
    <div className="mx-auto mt-16 w-full max-w-md px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Slonbelka</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-sm text-white">
            Level {d?.current_level ?? "-"}
          </span>
          <button onClick={logout} className="text-sm text-neutral-400 hover:text-neutral-700">
            log out
          </button>
        </div>
      </div>

      {lp && (
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-neutral-500">
            <span>{lp.guru} / {lp.total} at Guru</span>
            <span>{Math.round(lp.threshold * 100)}% to advance</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Tile label="Lessons" count={d?.lessons_available} color="bg-sky-100 text-sky-900" onClick={onStartLessons} />
        <Tile label="Reviews" count={d?.reviews_due} color="bg-amber-100 text-amber-900" onClick={onStartReviews} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <Stat label="Streak" value={d ? `${d.streak}d` : "-"} />
        <Stat label="Accuracy" value={d?.accuracy != null ? `${Math.round(d.accuracy * 100)}%` : "-"} />
        <Stat label="Next 24h" value={d ? `${d.reviews_upcoming_24h}` : "-"} />
      </div>

      {d && (
        <div className="mt-6 flex justify-between rounded-xl bg-neutral-100 px-4 py-3 text-center text-xs text-neutral-600">
          <Band label="Appr" n={d.srs_counts.apprentice} />
          <Band label="Guru" n={d.srs_counts.guru} />
          <Band label="Master" n={d.srs_counts.master} />
          <Band label="Enl" n={d.srs_counts.enlightened} />
          <Band label="Burned" n={d.srs_counts.burned} />
        </div>
      )}

      <button
        onClick={onOpenLeeches}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <span className="text-sm font-medium">Leeches</span>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
          {d?.leech_count ?? 0}
        </span>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={onBrowse}
          className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium hover:bg-neutral-50"
        >
          Browse words
        </button>
        <button
          onClick={onExtraStudy}
          className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium hover:bg-neutral-50"
        >
          Extra study
        </button>
        <button
          onClick={onStats}
          className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium hover:bg-neutral-50"
        >
          Stats
        </button>
        <button
          onClick={onBurned}
          className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium hover:bg-neutral-50"
        >
          Burned items
        </button>
      </div>

      <button
        onClick={onSettings}
        className="mt-3 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium hover:bg-neutral-50"
      >
        Settings
      </button>

      <button
        onClick={onUpgrade}
        className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-3 text-sm font-medium text-white"
      >
        Go Premium
      </button>
    </div>
  );
}

function Tile({
  label,
  count,
  color,
  onClick,
}: {
  label: string;
  count: number | undefined;
  color: string;
  onClick: () => void;
}) {
  const disabled = count === 0 || count === undefined;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-2xl py-10 ${color} disabled:opacity-40`}
    >
      <span className="text-4xl font-bold">{count ?? "-"}</span>
      <span className="mt-1 text-sm">{label}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 py-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function Band({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-neutral-800">{n}</div>
      <div>{label}</div>
    </div>
  );
}
