import { useEffect, useState } from "react";
import { addSynonym, browseItems, getItem, removeSynonym, resurrect } from "../lib/api";
import { useFetch } from "../lib/useFetch";

const STATUS_STYLE: Record<string, string> = {
  locked: "bg-neutral-200 text-neutral-500",
  available: "bg-sky-100 text-sky-700",
  apprentice: "bg-pink-100 text-pink-700",
  guru: "bg-purple-100 text-purple-700",
  master: "bg-blue-100 text-blue-700",
  enlightened: "bg-indigo-100 text-indigo-700",
  burned: "bg-neutral-800 text-white",
};

const POS_OPTIONS = ["", "noun", "verb", "adjective", "adverb", "pronoun", "particle", "preposition"];
const PAGE = 50;

export default function ItemBrowser({ onDone }: { onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [level, setLevel] = useState<number | "">("");
  const [pos, setPos] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reload from offset 0 whenever a filter changes.
  const list = useFetch(
    () =>
      browseItems({
        search: debounced || undefined,
        level: level === "" ? undefined : level,
        pos: pos || undefined,
        limit: PAGE,
        offset: 0,
      }),
    [debounced, level, pos],
  );
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const loadMore = async () => {
    try {
      const r = await browseItems({
        search: debounced || undefined,
        level: level === "" ? undefined : level,
        pos: pos || undefined,
        limit: PAGE,
        offset: items.length,
      });
      list.setData((prev) => (prev ? { ...r, items: [...prev.items, ...r.items] } : r));
    } catch {
      /* keep the current page; the button stays for another try */
    }
  };

  if (selectedId != null) {
    return <Detail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Browse words</h2>
        <button onClick={onDone} className="text-sm text-neutral-400 hover:text-neutral-700">
          done
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search word or meaning"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2"
      />

      <div className="mt-3 flex gap-2">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value === "" ? "" : Number(e.target.value))}
          className="flex-1 rounded-lg border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">All levels</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>Level {n}</option>
          ))}
        </select>
        <select
          value={pos}
          onChange={(e) => setPos(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-300 px-2 py-2 text-sm"
        >
          {POS_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === "" ? "All types" : p}</option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs text-neutral-400">{total} words</p>

      <div className="mt-2 divide-y divide-neutral-100">
        {list.status === "loading" ? (
          <p className="py-8 text-center text-neutral-400">loading...</p>
        ) : list.status === "error" ? (
          <p className="py-8 text-center text-neutral-400">
            Couldn't load words.{" "}
            <button onClick={list.retry} className="font-medium text-neutral-700 underline">
              Retry
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-neutral-400">no matches</p>
        ) : (
          items.map((it) => (
            <button
              key={it.id}
              onClick={() => setSelectedId(it.id)}
              className="flex w-full items-center justify-between py-3 text-left hover:bg-neutral-50"
            >
              <div className="min-w-0">
                <div className="truncate text-lg">{it.stressed_form}</div>
                <div className="truncate text-sm text-neutral-500">{it.translation_primary}</div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <span className="text-xs text-neutral-400">L{it.level}</span>
                <StatusBadge status={it.status} />
              </div>
            </button>
          ))
        )}
      </div>

      {items.length < total && (
        <button
          onClick={loadMore}
          className="mt-4 w-full rounded-lg border border-neutral-200 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Load more
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[status] ?? "bg-neutral-100 text-neutral-600"}`}>
      {status}
    </span>
  );
}

function Detail({ id, onBack }: { id: number; onBack: () => void }) {
  const fetched = useFetch(() => getItem(id), [id]);
  const item = fetched.data;
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [newSyn, setNewSyn] = useState("");
  const [savingSyn, setSavingSyn] = useState(false);

  useEffect(() => {
    if (fetched.data) setSynonyms(fetched.data.synonyms);
  }, [fetched.data]);

  const addSyn = async () => {
    const text = newSyn.trim();
    if (!text) return;
    setSavingSyn(true);
    try {
      const { synonyms: next } = await addSynonym(id, text);
      setSynonyms(next);
      setNewSyn("");
    } catch {
      /* leave the input so the user can retry */
    } finally {
      setSavingSyn(false);
    }
  };

  const removeSyn = async (text: string) => {
    try {
      const { synonyms: next } = await removeSynonym(id, text);
      setSynonyms(next);
    } catch {
      /* chip stays; the user can retry */
    }
  };

  const doResurrect = async () => {
    try {
      await resurrect(id);
      fetched.retry();
    } catch {
      /* button stays enabled for another try */
    }
  };

  if (fetched.status === "error")
    return (
      <Centered onBack={onBack}>
        Could not load that word.
        <button
          onClick={fetched.retry}
          className="mt-4 block w-full font-medium text-neutral-900 underline"
        >
          Retry
        </button>
      </Centered>
    );
  if (!item) return <Centered onBack={onBack}>loading...</Centered>;

  const meta = [item.part_of_speech, item.gender, item.aspect].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto mt-10 w-full max-w-md px-5">
      <button onClick={onBack} className="mb-4 text-sm text-neutral-500 hover:text-neutral-800">
        ← back
      </button>

      <div className="rounded-2xl border border-neutral-200 p-6 text-center">
        <div className="text-5xl">{item.stressed_form}</div>
        {item.ipa && <div className="mt-1 text-sm text-neutral-400">/{item.ipa}/</div>}
        <div className="mt-3 text-xl text-neutral-700">{item.translations.join(", ") || item.translation_primary}</div>
        {meta && <div className="mt-1 text-sm text-neutral-400">{meta}</div>}
        <div className="mt-3 flex items-center justify-center gap-2">
          <StatusBadge status={item.status} />
          <span className="text-xs text-neutral-400">Level {item.level}</span>
        </div>
        {item.audio_url && (
          <button
            onClick={() => new Audio(item.audio_url!).play()}
            className="mt-4 rounded-full bg-neutral-100 px-3 py-1 text-sm"
          >
            ▶ play
          </button>
        )}
        {item.status === "burned" && (
          <div className="mt-4">
            <button
              onClick={doResurrect}
              className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              Resurrect
            </button>
          </div>
        )}
      </div>

      {item.notes && <p className="mt-4 text-sm text-neutral-600">{item.notes}</p>}

      <Section title="Your synonyms">
        <p className="mb-2 text-xs text-neutral-400">
          Extra meanings you'll also be marked correct for.
        </p>
        {synonyms.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {synonyms.map((syn) => (
              <span
                key={syn}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm"
              >
                {syn}
                <button
                  onClick={() => removeSyn(syn)}
                  className="text-neutral-400 hover:text-neutral-700"
                  aria-label={`remove ${syn}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newSyn}
            onChange={(e) => setNewSyn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSyn()}
            placeholder="add a synonym"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={addSyn}
            disabled={savingSyn || !newSyn.trim()}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </Section>

      {item.mnemonic && (item.mnemonic.meaning || item.mnemonic.reading) && (
        <Section title="Your mnemonic">
          {item.mnemonic.meaning && <p className="text-sm text-neutral-700">{item.mnemonic.meaning}</p>}
          {item.mnemonic.reading && <p className="mt-1 text-sm text-neutral-700">{item.mnemonic.reading}</p>}
        </Section>
      )}

      {item.sentences.length > 0 && (
        <Section title="Examples">
          <ul className="space-y-3">
            {item.sentences.map((s, i) => (
              <li key={i}>
                <div className="text-neutral-800">{s.ru}</div>
                <div className="text-sm text-neutral-500">{s.en}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {item.state && (
        <Section title="Your progress">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Cell label="Stage" value={item.state.srs_band} />
            <Cell label="Correct" value={String(item.state.correct_count)} />
            <Cell label="Wrong" value={String(item.state.incorrect_count)} />
          </div>
          {item.state.is_leech && (
            <p className="mt-2 text-center text-xs text-rose-600">flagged as a leech</p>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 py-2">
      <div className="font-semibold capitalize">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function Centered({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md px-6 text-center text-neutral-600">
      {children}
      <button onClick={onBack} className="mt-4 block w-full text-neutral-500 underline">
        back
      </button>
    </div>
  );
}
