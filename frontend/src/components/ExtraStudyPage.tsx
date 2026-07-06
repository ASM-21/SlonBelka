import { useEffect, useState } from "react";
import { extraStudy, getLevels, ReviewItem } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import PracticeSession from "./PracticeSession";

const MODES = [
  { id: "recent_mistakes", label: "Recent mistakes", blurb: "Words you've missed lately" },
  { id: "recently_learned", label: "Recently learned", blurb: "Your newest words" },
  { id: "burned", label: "Burned words", blurb: "Practice retired words without unburning them" },
  { id: "level", label: "By level", blurb: "Drill an entire level" },
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
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Extra study</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          done
        </button>
      </div>

      <p className="mb-4 text-sm text-neutral-500">
        Free practice with no effect on your SRS schedule. Drill without consequences.
      </p>

      <div className="space-y-3">
        {MODES.filter((m) => m.id !== "level").map((m) => (
          <button
            key={m.id}
            onClick={() => launch(m.id, m.label)}
            disabled={busy}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-4 py-4 text-left hover:border-neutral-900 disabled:opacity-40"
          >
            <div>
              <div className="font-medium">{m.label}</div>
              <div className="text-sm text-neutral-500">{m.blurb}</div>
            </div>
            <span className="text-neutral-400">→</span>
          </button>
        ))}

        <div className="rounded-xl border border-neutral-200 px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="font-medium">By level</div>
              <div className="text-sm text-neutral-500">Drill an entire level</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
            >
              {(levels.data ?? [{ level }]).map((lv) => (
                <option key={lv.level} value={lv.level}>Level {lv.level}</option>
              ))}
            </select>
            <button
              onClick={() => launch("level", `Level ${level}`, level)}
              disabled={busy}
              className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Start
            </button>
          </div>
        </div>
      </div>

      {note && <p className="mt-4 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600">{note}</p>}
    </div>
  );
}
