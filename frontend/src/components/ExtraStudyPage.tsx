import { useEffect, useState } from "react";
import { extraStudy, getLevels, ReviewItem } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import PracticeSession from "./PracticeSession";
import { PageHeader } from "./ui";

const MODES = [
  { id: "recent_mistakes", ru: "Недавние ошибки", label: "Recent mistakes", blurb: "Words you've missed lately" },
  { id: "recently_learned", ru: "Недавно изученные", label: "Recently learned", blurb: "Your newest words" },
  { id: "burned", ru: "Сожжённые слова", label: "Burned words", blurb: "Practice retired words without unburning them" },
  { id: "level", ru: "По уровню", label: "By level", blurb: "Drill an entire level" },
];

export default function ExtraStudyPage({ onDone }: { onDone: () => void }) {
  const [studySet, setStudySet] = useState<ReviewItem[] | null>(null);
  const [title, setTitle] = useState("Extra study");
  const [level, setLevel] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const levels = useFetch(getLevels);

  // Default the level picker to the user's current level once known.
  const currentLevel = levels.data?.find((lv) => lv.current)?.level;
  useEffect(() => {
    if (currentLevel) setLevel(currentLevel);
  }, [currentLevel]);

  if (studySet) {
    return <PracticeSession items={studySet} title={title} onDone={() => setStudySet(null)} />;
  }

  const launch = async (mode: string, label: string, lvl?: number) => {
    setBusy(true);
    setNote(null);
    try {
      const items = await extraStudy(mode, lvl);
      if (items.length === 0) {
        setNote("Nothing to practice there yet.");
        return;
      }
      setTitle(label);
      setStudySet(items);
    } catch {
      setNote("Couldn't load that set. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <PageHeader ru="Доп. практика" en="Extra practice" onBack={onDone} />

      <p className="mb-4 text-sm leading-relaxed text-sb-muted">
        Тренируйтесь без влияния на расписание SRS. · Practice without affecting your SRS schedule.
      </p>

      <div className="space-y-2.5">
        {MODES.filter((m) => m.id !== "level").map((m) => (
          <button
            key={m.id}
            onClick={() => launch(m.id, m.label)}
            disabled={busy}
            className="flex w-full items-center justify-between rounded-2xl border border-sb-line bg-sb-card px-4 py-3.5 text-left hover:border-sb-muted disabled:opacity-40"
          >
            <div>
              <div className="font-semibold text-sb-ink">
                {m.ru} <span className="text-xs font-medium text-sb-muted">· {m.label}</span>
              </div>
              <div className="text-sm text-sb-muted">{m.blurb}</div>
            </div>
            <span className="rounded-full bg-sb-accent-soft px-2.5 py-0.5 text-xs font-bold text-sb-accent">
              старт
            </span>
          </button>
        ))}

        <div className="rounded-2xl border border-sb-line bg-sb-card px-4 py-3.5">
          <div className="mb-2">
            <div className="font-semibold text-sb-ink">
              По уровню <span className="text-xs font-medium text-sb-muted">· By level</span>
            </div>
            <div className="text-sm text-sb-muted">Drill an entire level</div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="rounded-lg border border-sb-line bg-sb-card px-2 py-1.5 text-sm"
            >
              {(levels.data ?? [{ level }]).map((lv) => (
                <option key={lv.level} value={lv.level}>Level {lv.level}</option>
              ))}
            </select>
            <button
              onClick={() => launch("level", `Level ${level}`, level)}
              disabled={busy}
              className="rounded-lg bg-sb-ink px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Start
            </button>
          </div>
        </div>
      </div>

      {note && <p className="mt-4 rounded-xl bg-sb-card2 px-3 py-2 text-sm text-sb-muted">{note}</p>}
    </div>
  );
}
