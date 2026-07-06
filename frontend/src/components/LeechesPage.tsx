import { useState } from "react";
import { getLeeches, Leech, leechStudy, ReviewItem, saveMnemonic } from "../lib/api";
import { LEECH_LABEL } from "../lib/labels";
import { useFetch } from "../lib/useFetch";
import PracticeSession from "./PracticeSession";

export default function LeechesPage({ onDone }: { onDone: () => void }) {
  const { status, data: leeches, retry } = useFetch(getLeeches);
  const [studySet, setStudySet] = useState<ReviewItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (studySet) {
    return <PracticeSession items={studySet} title={LEECH_LABEL} onDone={() => setStudySet(null)} />;
  }

  if (status === "loading") return <Centered>loading...</Centered>;
  if (status === "error" || leeches === null)
    return (
      <Centered>
        Couldn't load this page.
        <button onClick={retry} className="mt-4 block w-full font-medium text-neutral-900 underline">
          Retry
        </button>
        <button onClick={onDone} className="mt-2 block w-full text-neutral-500 underline">
          back home
        </button>
      </Centered>
    );

  return (
    <div className="mx-auto mt-12 w-full max-w-md px-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{LEECH_LABEL}</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          back
        </button>
      </div>

      {leeches.length === 0 ? (
        <Centered>No tricky words right now. Words you keep missing will show up here.</Centered>
      ) : (
        <>
          <button
            onClick={async () => {
              try {
                setStudySet(await leechStudy());
              } catch {
                setNote("Couldn't start the session. Try again.");
              }
            }}
            className="mb-4 w-full rounded-lg bg-neutral-900 py-2 font-medium text-white"
          >
            Study these {leeches.length}
          </button>
          {note && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{note}</p>}
          <div className="flex flex-col gap-2">
            {leeches.map((l) => (
              <LeechRow key={l.item_id} leech={l} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeechRow({ leech }: { leech: Leech }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await saveMnemonic(leech.item_id, { meaning_mnemonic: text });
    setSaved(true);
  };

  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl">{leech.stressed_form}</div>
          <div className="text-sm text-neutral-500">{leech.translation_primary}</div>
        </div>
        <div className="text-right text-xs text-neutral-500">
          <div>{leech.stage_name}</div>
          <div>
            {leech.incorrect_count} misses
            {leech.accuracy != null && ` · ${Math.round(leech.accuracy * 100)}%`}
          </div>
        </div>
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-2 text-xs text-neutral-400 hover:text-neutral-700"
      >
        {open ? "hide mnemonic" : "add / edit mnemonic"}
      </button>
      {open && (
        <div className="mt-2">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
            placeholder="a hook to remember this word"
            className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
            rows={2}
          />
          <button
            onClick={save}
            disabled={!text || saved}
            className="mt-1 rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40"
          >
            {saved ? "saved" : "save"}
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-16 max-w-md px-6 text-center text-neutral-600">{children}</div>;
}
