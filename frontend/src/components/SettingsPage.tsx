import { useState } from "react";
import { deleteAccount, exportAccount, getSettings, Settings, setVacation, token, updateSettings } from "../lib/api";
import { enableReminders, pushSupported } from "../lib/push";
import { getTheme, setTheme, Theme } from "../lib/theme";
import { useFetch } from "../lib/useFetch";
import { LegalDoc } from "./LegalPage";
import { PageHeader } from "./ui";

export default function SettingsPage({
  onDone,
  onShowLegal,
  onAccountDeleted,
  onReplayOnboarding,
}: {
  onDone: () => void;
  onShowLegal: (doc: LegalDoc) => void;
  onAccountDeleted: () => void;
  onReplayOnboarding: () => void;
}) {
  const { status, data: s, setData: setS, retry } = useFetch(getSettings);
  const [saving, setSaving] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [dangerMsg, setDangerMsg] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const downloadExport = async () => {
    setDangerMsg(null);
    try {
      const data = await exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slonbelka-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDangerMsg("Export failed. Try again in a moment.");
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    setDangerMsg(null);
    try {
      await deleteAccount(deletePassword);
      token.clear();
      onAccountDeleted();
    } catch (e) {
      setDangerMsg(
        String(e).includes("403")
          ? "That password is incorrect."
          : "Could not delete the account. Try again in a moment.",
      );
      setSaving(false);
    }
  };

  if (status === "loading") return <Centered onDone={onDone}>loading settings...</Centered>;
  if (status === "error" || !s)
    return (
      <Centered onDone={onDone}>
        Couldn't load settings.
        <button
          onClick={retry}
          className="mt-4 w-full rounded-xl bg-sb-ink py-2.5 font-bold text-white"
        >
          Retry
        </button>
      </Centered>
    );

  const patch = async (p: Partial<Omit<Settings, "frozen">>) => {
    setSaving(true);
    const next = await updateSettings(p);
    setS((cur) => (cur ? { ...next, frozen: cur.frozen } : next));
    setSaving(false);
  };

  const toggleVacation = async () => {
    setSaving(true);
    const { frozen } = await setVacation(!s.frozen);
    setS((cur) => (cur ? { ...cur, frozen } : cur));
    setSaving(false);
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <PageHeader ru="Настройки" en="Settings" onBack={onDone} />

      <Row label="Daily lesson limit" hint="New words you can start each day">
        <div className="flex items-center gap-2">
          <Stepper
            value={s.daily_lesson_cap}
            onChange={(v) => patch({ daily_lesson_cap: v })}
            min={1}
            max={100}
            disabled={saving}
          />
        </div>
      </Row>

      <Row label="Autoplay audio" hint="Play pronunciation automatically in reviews">
        <Toggle
          on={s.autoplay_audio}
          onClick={() => patch({ autoplay_audio: !s.autoplay_audio })}
          disabled={saving}
          label="Autoplay audio"
        />
      </Row>

      <Row label="Review session size" hint="Cap words per review session">
        <select
          aria-label="Review session size"
          value={s.session_size}
          onChange={(e) => patch({ session_size: Number(e.target.value) })}
          disabled={saving}
          className="rounded-lg border border-sb-line bg-sb-card px-2 py-1 text-sm text-sb-ink"
        >
          <option value={0}>No limit</option>
          <option value={10}>10 words</option>
          <option value={20}>20 words</option>
          <option value={30}>30 words</option>
          <option value={50}>50 words</option>
        </select>
      </Row>

      <Row label="Appearance" hint="Light, dark, or follow your device">
        <select
          aria-label="Appearance"
          value={theme}
          onChange={(e) => {
            const t = e.target.value as Theme;
            setTheme(t);
            setThemeState(t);
          }}
          className="rounded-lg border border-sb-line bg-sb-card px-2 py-1 text-sm text-sb-ink"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </Row>

      <Row label="Keyboard layout" hint="On-screen Cyrillic keyboard">
        <select
          value={s.keyboard_layout}
          onChange={(e) => patch({ keyboard_layout: e.target.value })}
          disabled={saving}
          className="rounded-lg border border-sb-line bg-sb-card px-2 py-1 text-sm"
        >
          <option value="jcuken">JCUKEN (standard)</option>
          <option value="phonetic">Phonetic</option>
        </select>
      </Row>

      <div className="mt-8 rounded-2xl border border-sb-line bg-sb-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sb-ink">Vacation mode</div>
            <div className="text-sm text-sb-muted">
              {s.frozen ? "Reviews are paused. No new reviews appear and items don't fall behind." : "Pause reviews while you're away"}
            </div>
          </div>
          <Toggle on={s.frozen} onClick={toggleVacation} disabled={saving} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-sb-line bg-sb-card p-4">
        <div className="font-semibold text-sb-ink">Review reminders</div>
        <div className="mt-1 text-sm text-sb-muted">
          Get a push notification when reviews are waiting.
        </div>
        {pushSupported() ? (
          <button
            onClick={async () => {
              const r = await enableReminders();
              setReminderMsg(
                r === "ok"
                  ? "Reminders enabled."
                  : r === "denied"
                    ? "Notifications were blocked in your browser."
                    : "Reminders aren't available here.",
              );
            }}
            className="mt-3 rounded-lg bg-sb-ink px-4 py-2 text-sm font-bold text-white"
          >
            Enable reminders
          </button>
        ) : (
          <p className="mt-3 text-sm text-sb-muted">
            Not available in this browser or build (needs notification support and a configured key).
          </p>
        )}
        {reminderMsg && <p className="mt-2 text-sm text-sb-muted">{reminderMsg}</p>}

        <div className="mt-4 flex items-center justify-between border-t border-sb-line pt-4">
          <div className="pr-4">
            <div className="text-sm font-semibold text-sb-ink">Send me reminders</div>
            <div className="text-sm text-sb-muted">Turn off to keep the app but stop the nudges</div>
          </div>
          <Toggle
            on={s.reminders_enabled}
            onClick={() => patch({ reminders_enabled: !s.reminders_enabled })}
            disabled={saving}
            label="Send me reminders"
          />
        </div>

        {s.reminders_enabled && (
          <div className="mt-3 border-t border-sb-line pt-3">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <div className="text-sm font-semibold text-sb-ink">Quiet hours</div>
                <div className="text-sm text-sb-muted">No reminders during these hours</div>
              </div>
              <Toggle
                on={s.quiet_hours_enabled}
                onClick={() => patch({ quiet_hours_enabled: !s.quiet_hours_enabled })}
                disabled={saving}
                label="Quiet hours"
              />
            </div>
            {s.quiet_hours_enabled && (
              <div className="mt-3 flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <span className="text-sb-muted">From</span>
                  <HourSelect
                    value={s.quiet_hours_start}
                    onChange={(v) => patch({ quiet_hours_start: v })}
                    disabled={saving}
                    label="Quiet hours start"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sb-muted">to</span>
                  <HourSelect
                    value={s.quiet_hours_end}
                    onChange={(v) => patch({ quiet_hours_end: v })}
                    disabled={saving}
                    label="Quiet hours end"
                  />
                </label>
                <span className="text-xs text-sb-muted">your local time</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-sb-line bg-sb-card p-4">
        <div className="font-semibold text-sb-ink">Legal</div>
        <div className="mt-2 flex flex-col items-start gap-2 text-sm">
          <button
            onClick={() => onShowLegal("terms")}
            className="text-sb-muted underline hover:text-sb-ink"
          >
            Terms of Service
          </button>
          <button
            onClick={() => onShowLegal("privacy")}
            className="text-sb-muted underline hover:text-sb-ink"
          >
            Privacy Policy
          </button>
          <button
            onClick={() => onShowLegal("licenses")}
            className="text-sb-muted underline hover:text-sb-ink"
          >
            Content licenses and attribution
          </button>
          <button
            onClick={onReplayOnboarding}
            className="text-sb-muted underline hover:text-sb-ink"
          >
            Show the welcome tour again
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-sb-line bg-sb-card p-4">
        <div className="font-semibold text-sb-ink">Your data</div>
        <div className="mt-1 text-sm text-sb-muted">
          Download everything tied to your account as JSON: profile, settings, and full study
          history.
        </div>
        <button
          onClick={downloadExport}
          className="mt-3 rounded-lg bg-sb-ink px-4 py-2 text-sm font-bold text-white"
        >
          Download my data
        </button>

        <div className="mt-5 border-t border-sb-line pt-4">
          <div className="font-semibold text-red-700">Delete account</div>
          <div className="mt-1 text-sm text-sb-muted">
            Permanently deletes your account and all progress. This cannot be undone.
          </div>
          {!confirmingDelete ? (
            <button
              onClick={() => {
                setDangerMsg(null);
                setConfirmingDelete(true);
              }}
              className="mt-3 rounded-lg border border-red-700 px-4 py-2 text-sm font-bold text-red-700"
            >
              Delete my account
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="password"
                placeholder="confirm your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full rounded-xl border border-sb-line bg-sb-card px-4 py-2.5 text-sm text-sb-ink outline-none focus:border-sb-muted"
              />
              <div className="flex gap-2">
                <button
                  onClick={confirmDelete}
                  disabled={saving || !deletePassword}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  Permanently delete
                </button>
                <button
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeletePassword("");
                    setDangerMsg(null);
                  }}
                  disabled={saving}
                  className="rounded-lg border border-sb-line px-4 py-2 text-sm font-bold text-sb-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {dangerMsg && <p className="mt-2 text-sm text-red-700">{dangerMsg}</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-sb-line py-4">
      <div className="pr-4">
        <div className="font-semibold text-sb-ink">{label}</div>
        <div className="text-sm text-sb-muted">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-sb-enl" : "bg-sb-line"} disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function HourSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className="rounded-lg border border-sb-line bg-sb-card px-2 py-1 text-sm text-sb-ink"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className="h-7 w-7 rounded-full border border-sb-line bg-sb-card text-lg leading-none disabled:opacity-30"
      >
        −
      </button>
      <span className="w-8 text-center font-semibold">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        className="h-7 w-7 rounded-full border border-sb-line bg-sb-card text-lg leading-none disabled:opacity-30"
      >
        +
      </button>
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
