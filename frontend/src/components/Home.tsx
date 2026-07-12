import { useEffect, useState } from "react";
import { billingPortal, getBillingStatus, getDashboard, getMe, logout as apiLogout, resendVerification } from "../lib/api";
import { BAND_LABELS, LEECH_LABEL, LEECH_LABEL_RU } from "../lib/labels";
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
  const meFetch = useFetch(getMe);
  const billingFetch = useFetch(getBillingStatus);
  const [verifySent, setVerifySent] = useState(false);

  const logout = async () => {
    await apiLogout();
    onLogout();
  };

  // Mirror the due-review count onto the installed app's icon badge.
  useEffect(() => {
    if (!d) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (d.reviews_due > 0) nav.setAppBadge?.(d.reviews_due).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [d]);

  const lp = d?.level_progress;
  const progressPct = lp && lp.threshold > 0 ? Math.min(100, (lp.fraction / lp.threshold) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sb-ink font-mono text-xs font-bold text-sb-gold">
            SB
          </div>
          <span className="font-display text-2xl font-extrabold text-sb-ink">Слонбелка</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-sb-accent-soft px-3 py-1 text-[13px] font-bold text-sb-accent">
            Ур. {d?.current_level ?? "-"} · Lvl {d?.current_level ?? "-"}
          </span>
          <button onClick={logout} className="text-[13px] text-sb-muted hover:text-sb-ink">
            выйти · exit
          </button>
        </div>
      </div>

      {status === "error" && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-sb-accent-soft px-3 py-2 text-sm text-sb-accent2">
          <span>Couldn't load your dashboard.</span>
          <button onClick={retry} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {billingFetch.data?.status === "past_due" && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <div className="font-semibold">Оплата не прошла · Your last payment failed</div>
          <div className="mt-0.5">Update your payment method to keep Premium.</div>
          <button
            onClick={async () => {
              try {
                const { url } = await billingPortal();
                window.location.href = url;
              } catch {
                /* portal unavailable; nothing to do */
              }
            }}
            className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-bold text-white"
          >
            Update payment
          </button>
        </div>
      )}

      {meFetch.data && !meFetch.data.email_verified && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-sb-gold-soft px-3 py-2 text-sm text-sb-gold-ink">
          <span>Подтвердите почту · Please verify your email.</span>
          {verifySent ? (
            <span className="shrink-0 font-semibold">Sent, check your inbox.</span>
          ) : (
            <button
              onClick={async () => {
                try {
                  await resendVerification();
                  setVerifySent(true);
                } catch {
                  /* the button stays for another try */
                }
              }}
              className="shrink-0 font-semibold underline"
            >
              выслать снова · resend
            </button>
          )}
        </div>
      )}

      {lp && (
        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-sb-muted">
            <span>
              {lp.guru} / {lp.total} на Гуру · to Guru
            </span>
            <span>
              {Math.round(progressPct)}% до Ур. {lp.level + 1} · to Lvl {lp.level + 1}
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-sb-card2"
            role="progressbar"
            aria-label="Progress to the next level"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-sb-accent" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {lp?.cleared && (
        <button
          onClick={onUpgrade}
          className="mb-5 w-full rounded-2xl bg-gradient-to-r from-sb-accent to-sb-gold p-4 text-left text-white shadow-lg shadow-sb-accent/30"
        >
          <div className="text-sm font-bold">
            Уровень {lp.level} пройден! · Level {lp.level} cleared!
          </div>
          <div className="mt-0.5 text-xs opacity-90">
            Premium unlocks level {lp.level + 1} and everything beyond.
          </div>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <HeroTile
          ru="Уроки"
          en="Lessons"
          count={d?.lessons_available}
          className="bg-sb-ink"
          ruClass="text-[#CFC6B6]"
          enClass="text-[#9C968A]"
          onClick={onStartLessons}
        />
        <HeroTile
          ru="Повторения"
          en="Reviews"
          count={d?.reviews_due}
          caption={d && d.reviews_upcoming_24h > 0 ? `+${d.reviews_upcoming_24h} in 24h` : undefined}
          className="bg-sb-accent shadow-lg shadow-sb-accent/30"
          ruClass="text-[#F6E0D6]"
          enClass="text-[#F2CFC0]"
          onClick={onStartReviews}
        />
      </div>

      {d && (
        <div className="mt-3 flex gap-1.5">
          <Band label={BAND_LABELS.apprentice} n={d.srs_counts.apprentice} className="bg-sb-appr text-white" />
          <Band label={BAND_LABELS.guru} n={d.srs_counts.guru} className="bg-sb-guru text-white" />
          <Band label={BAND_LABELS.master} n={d.srs_counts.master} className="bg-sb-master text-white" />
          <Band label={BAND_LABELS.enlightened} n={d.srs_counts.enlightened} className="bg-sb-enl text-white" />
          <Band label={BAND_LABELS.burned} n={d.srs_counts.burned} className="bg-sb-burned text-sb-gold" burned />
        </div>
      )}

      <button
        onClick={onOpenLeeches}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-sb-line bg-sb-card px-4 py-3.5 text-left hover:border-sb-muted"
      >
        <span className="text-sm">
          <span className="font-semibold text-sb-ink">{LEECH_LABEL_RU}</span>{" "}
          <span className="text-xs text-sb-muted">· {LEECH_LABEL}</span>
        </span>
        <span className="rounded-full bg-sb-accent-soft px-2.5 py-0.5 text-xs font-bold text-sb-accent">
          {d?.leech_count ?? 0}
        </span>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <NavCard ru="Словарь" en="Dictionary" onClick={onBrowse} />
        <NavCard ru="Доп. практика" en="Extra practice" onClick={onExtraStudy} />
        <NavCard ru="Статистика" en="Statistics" onClick={onStats} />
        <NavCard ru="Сожжённые" en="Burned" onClick={onBurned} />
      </div>

      <button
        onClick={onSettings}
        className="mt-2.5 w-full rounded-xl border border-sb-line bg-sb-card px-4 py-3 text-center hover:border-sb-muted"
      >
        <span className="block text-sm font-semibold text-sb-ink">Настройки</span>
        <span className="block text-[11px] text-sb-muted">Settings</span>
      </button>

      <button
        onClick={onUpgrade}
        className="mt-2.5 w-full rounded-xl bg-gradient-to-r from-sb-accent to-sb-gold px-4 py-3 leading-tight text-white shadow-lg shadow-sb-accent/30"
      >
        <span className="block text-sm font-bold">Слонбелка Премиум</span>
        <span className="block text-[11px] font-medium opacity-90">Slonbelka Premium</span>
      </button>
    </div>
  );
}

function HeroTile({
  ru,
  en,
  count,
  caption,
  className,
  ruClass,
  enClass,
  onClick,
}: {
  ru: string;
  en: string;
  count: number | undefined;
  caption?: string;
  className: string;
  ruClass: string;
  enClass: string;
  onClick: () => void;
}) {
  const disabled = count === 0 || count === undefined;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl p-4 pb-3.5 text-left ${className} disabled:opacity-40`}
    >
      <div className="font-display text-4xl font-extrabold leading-none text-white">{count ?? "-"}</div>
      <div className={`mt-1 text-sm font-semibold ${ruClass}`}>{ru}</div>
      <div className={`text-[11px] font-semibold ${enClass}`}>
        {en}
        {caption ? ` · ${caption}` : ""}
      </div>
    </button>
  );
}

function Band({
  label,
  n,
  className,
  burned = false,
}: {
  label: string;
  n: number;
  className: string;
  burned?: boolean;
}) {
  return (
    <div className={`flex-1 rounded-xl py-2 text-center ${className}`}>
      <div className="font-display text-base font-extrabold leading-tight">{n}</div>
      <div className={`text-[9px] font-semibold ${burned ? "text-[#C9B99C]" : "opacity-95"}`}>{label}</div>
    </div>
  );
}

function NavCard({ ru, en, onClick }: { ru: string; en: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-sb-line bg-sb-card px-3 py-3 text-center hover:border-sb-muted"
    >
      <span className="block text-sm font-semibold text-sb-ink">{ru}</span>
      <span className="block text-[11px] text-sb-muted">{en}</span>
    </button>
  );
}
