import { useState } from "react";
import { getLeeches, Leech, leechStudy, ReviewItem, saveMnemonic } from "../lib/api";
import { LEECH_LABEL, LEECH_LABEL_RU } from "../lib/labels";
import { useFetch } from "../lib/useFetch";
import PracticeSession from "./PracticeSession";
import { PageHeader } from "./ui";

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
        <button onClick={retry} className="mt-4 block w-full font-semibold text-sb-ink underline">
          Retry
        </button>
        <button onClick={onDone} className="mt-2 block w-full text-sb-muted underline">
          back home
        </button>
      </Centered>
    );

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <PageHeader ru={LEECH_LABEL_RU} en={LEECH_LABEL} onBack={onDone} />
      <p className="mb-4 text-sm leading-relaxed text-sb-muted">
        Слова, которые чаще всего вас подводят. · The words that trip you up most.
      </p>

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
            className="mb-4 w-full rounded-xl bg-sb-ink py-3 font-bold text-white"
          >
            Тренировать эти {leeches.length} · Study these {leeches.length}
          </button>
          {note && <p className="mb-3 rounded-xl bg-sb-accent-soft px-3 py-2 text-sm text-sb-accent2">{note}</p>}
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
    <div className="rounded-2xl border border-sb-line bg-sb-card p-3.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-xl font-bold text-sb-ink">{leech.stressed_form}</div>
          <div className="text-sm text-sb-muted">{leech.translation_primary}</div>
        </div>
        <div className="text-right text-xs text-sb-muted">
          <div>{leech.stage_name}</div>
          <div>
            {leech.incorrect_count} misses
            {leech.accuracy != null && ` · ${Math.round(leech.accuracy * 100)}%`}
          </div>
        </div>
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-2 text-xs text-sb-muted hover:text-sb-ink"
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
            className="w-full rounded-lg border border-sb-line bg-white px-2 py-1 text-sm"
            rows={2}
          />
          <button
            onClick={save}
            disabled={!text || saved}
            className="mt-1 rounded-lg bg-sb-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saved ? "saved" : "save"}
          </button>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-16 max-w-md px-6 text-center text-sb-muted">{children}</div>;
}
