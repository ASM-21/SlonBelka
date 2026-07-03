import { useEffect, useState } from "react";
import { getSettings, Settings, setVacation, updateSettings } from "../lib/api";
import { enableReminders, pushSupported } from "../lib/push";

export default function SettingsPage({ onDone }: { onDone: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setS).catch(() => setS(null));
  }, []);

  if (!s) return <Centered onDone={onDone}>loading settings...</Centered>;

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
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          done
        </button>
      </div>

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
          className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="jcuken">JCUKEN (standard)</option>
          <option value="phonetic">Phonetic</option>
        </select>
      </Row>

      <div className="mt-8 rounded-xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Vacation mode</div>
            <div className="text-sm text-neutral-500">
              {s.frozen ? "Reviews are paused. No new reviews appear and items don't fall behind." : "Pause reviews while you're away"}
            </div>
          </div>
          <Toggle on={s.frozen} onClick={toggleVacation} disabled={saving} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 p-4">
        <div className="font-medium">Review reminders</div>
        <div className="mt-1 text-sm text-neutral-500">
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
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Enable reminders
          </button>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            Not available in this browser or build (needs notification support and a configured key).
          </p>
        )}
        {reminderMsg && <p className="mt-2 text-sm text-neutral-600">{reminderMsg}</p>}
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-4">
      <div className="pr-4">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-neutral-500">{hint}</div>
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
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-neutral-300"} disabled:opacity-50`}
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
        className="h-7 w-7 rounded-full border border-neutral-300 text-lg leading-none disabled:opacity-30"
      >
        −
      </button>
      <span className="w-8 text-center font-semibold">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        className="h-7 w-7 rounded-full border border-neutral-300 text-lg leading-none disabled:opacity-30"
      >
        +
      </button>
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
