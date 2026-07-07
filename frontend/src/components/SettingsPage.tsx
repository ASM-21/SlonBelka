import { useState } from "react";
import { getSettings, Settings, setVacation, updateSettings } from "../lib/api";
import { enableReminders, pushSupported } from "../lib/push";
import { useFetch } from "../lib/useFetch";
import { LegalDoc } from "./LegalPage";
import { PageHeader } from "./ui";

export default function SettingsPage({
  onDone,
  onShowLegal,
}: {
  onDone: () => void;
  onShowLegal: (doc: LegalDoc) => void;
}) {
  const { status, data: s, setData: setS, retry } = useFetch(getSettings);
  const [saving, setSaving] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

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
        <Toggle on={s.autoplay_audio} onClick={() => patch({ autoplay_audio: !s.autoplay_audio })} disabled={saving} />
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

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-sb-enl" : "bg-sb-line"} disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
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
