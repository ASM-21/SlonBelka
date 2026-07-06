import { getDashboard, logout as apiLogout } from "../lib/api";
import { BAND_LABELS, LEECH_LABEL } from "../lib/labels";
import { useFetch } from "../lib/useFetch";

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
  const { status, data: d, retry } = useFetch(getDashboard);

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

      {status === "error" && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>Couldn't load your dashboard.</span>
          <button onClick={retry} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

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
        <Tile
          label="Reviews"
          count={d?.reviews_due}
          caption={d && d.reviews_upcoming_24h > 0 ? `+${d.reviews_upcoming_24h} in 24h` : undefined}
          color="bg-amber-100 text-amber-900"
          onClick={onStartReviews}
        />
      </div>

      {d && (
        <div className="mt-6 grid grid-cols-5 gap-1 rounded-xl bg-neutral-100 px-2 py-3 text-center text-neutral-600">
          <Band label={BAND_LABELS.apprentice} n={d.srs_counts.apprentice} />
          <Band label={BAND_LABELS.guru} n={d.srs_counts.guru} />
          <Band label={BAND_LABELS.master} n={d.srs_counts.master} />
          <Band label={BAND_LABELS.enlightened} n={d.srs_counts.enlightened} />
          <Band label={BAND_LABELS.burned} n={d.srs_counts.burned} />
        </div>
      )}

      <button
        onClick={onOpenLeeches}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <span className="text-sm font-medium">{LEECH_LABEL}</span>
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
  caption,
  color,
  onClick,
}: {
  label: string;
  count: number | undefined;
  caption?: string;
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
      {caption && <span className="mt-0.5 text-xs opacity-70">{caption}</span>}
    </button>
  );
}

function Band({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-neutral-800">{n}</div>
      <div className="text-[10px]">{label}</div>
    </div>
  );
}
