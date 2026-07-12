import { useEffect, useState } from "react";
import { addSynonym, browseItems, getItem, getLevels, LevelSummary, removeSynonym, resurrect } from "../lib/api";
import { LEVEL_BANDS } from "../lib/labels";
import { Fetch, useFetch } from "../lib/useFetch";
import { PageHeader } from "./ui";

const STATUS_STYLE: Record<string, string> = {
  locked: "bg-sb-card2 text-sb-muted",
  available: "bg-sb-gold-soft text-sb-gold-ink",
  apprentice: "bg-sb-appr text-white",
  guru: "bg-sb-guru text-white",
  master: "bg-sb-master text-white",
  enlightened: "bg-sb-enl text-white",
  burned: "bg-sb-burned text-sb-gold",
};

const POS_OPTIONS = ["", "noun", "verb", "adjective", "adverb", "pronoun", "particle", "preposition"];
const PAGE = 50;

export default function ItemBrowser({ onDone }: { onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [level, setLevel] = useState<number | "">("");
  const [pos, setPos] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<"levels" | "list">("levels");
  const levels = useFetch(getLevels);

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
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <PageHeader ru="Словарь" en="Dictionary" onBack={onDone} />

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (e.target.value) setView("list");
        }}
        placeholder="поиск · search word or meaning"
        className="w-full rounded-xl border border-sb-line bg-sb-card px-3 py-2.5 outline-none focus:border-sb-muted"
      />

      {view === "levels" ? (
        <LevelGrid
          levels={levels}
          onPick={(n) => {
            setLevel(n);
            setView("list");
          }}
          onAll={() => {
            setLevel("");
            setView("list");
          }}
        />
      ) : (
        <>
          <button
            onClick={() => {
              setView("levels");
              setSearch("");
              setLevel("");
              setPos("");
            }}
            className="mt-3 text-sm text-sb-muted hover:text-sb-ink"
          >
            ← уровни · levels
          </button>

          <div className="mt-2 flex gap-2">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value === "" ? "" : Number(e.target.value))}
              className="flex-1 rounded-lg border border-sb-line bg-sb-card px-2 py-2 text-sm"
            >
              <option value="">All levels</option>
              {(levels.data ?? []).map((lv) => (
                <option key={lv.level} value={lv.level}>Level {lv.level}</option>
              ))}
            </select>
            <select
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              className="flex-1 rounded-lg border border-sb-line bg-sb-card px-2 py-2 text-sm"
            >
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p}>{p === "" ? "All types" : p}</option>
              ))}
            </select>
          </div>

          <p className="mt-3 text-xs text-sb-muted">{total} words</p>

          <div className="mt-2 divide-y divide-sb-line">
            {list.status === "loading" ? (
              <p className="py-8 text-center text-sb-muted">loading...</p>
            ) : list.status === "error" ? (
              <p className="py-8 text-center text-sb-muted">
                Couldn't load words.{" "}
                <button onClick={list.retry} className="font-semibold text-sb-ink underline">
                  Retry
                </button>
              </p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sb-muted">no matches</p>
            ) : (
              items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => setSelectedId(it.id)}
                  className="flex w-full items-center justify-between py-3 text-left hover:bg-sb-card"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg font-bold text-sb-ink">{it.stressed_form}</div>
                    <div className="truncate text-sm text-sb-muted">{it.translation_primary}</div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="text-xs text-sb-muted">L{it.level}</span>
                    <StatusBadge status={it.status} />
                  </div>
                </button>
              ))
            )}
          </div>

          {items.length < total && (
            <button
              onClick={loadMore}
              className="mt-4 w-full rounded-xl border border-sb-line bg-sb-card py-2 text-sm text-sb-muted hover:border-sb-muted"
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LevelGrid({
  levels,
  onPick,
  onAll,
}: {
  levels: Fetch<LevelSummary[]>;
  onPick: (level: number) => void;
  onAll: () => void;
}) {
  if (levels.status === "loading")
    return <p className="py-8 text-center text-sb-muted">loading levels...</p>;
  if (levels.status === "error" || !levels.data)
    return (
      <p className="py-8 text-center text-sb-muted">
        Couldn't load levels.{" "}
        <button onClick={levels.retry} className="font-semibold text-sb-ink underline">
          Retry
        </button>
      </p>
    );

  // Group into bands of ten levels, each with its themed name.
  const bands = new Map<number, LevelSummary[]>();
  for (const lv of levels.data) {
    const b = Math.floor((lv.level - 1) / 10);
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b)!.push(lv);
  }

  return (
    <div className="mt-4">
      {[...bands.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([bandIdx, lvls]) => {
          const name = LEVEL_BANDS[Math.min(bandIdx, LEVEL_BANDS.length - 1)];
          return (
            <div key={bandIdx} className="mb-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-sb-muted">
                {name.ru} · {name.en}
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {lvls.map((lv) => (
                  <button
                    key={lv.level}
                    onClick={() => onPick(lv.level)}
                    className={`rounded-xl border bg-sb-card p-2 text-center hover:border-sb-muted ${
                      lv.current ? "border-sb-accent" : "border-sb-line"
                    } ${lv.accessible ? "" : "opacity-50"}`}
                  >
                    <div className="font-display text-lg font-bold text-sb-ink">{lv.level}</div>
                    <div className="text-[10px] text-sb-muted">
                      {lv.accessible ? (
                        <>
                          {lv.cleared && <span className="text-sb-enl">✓ </span>}
                          {lv.guru}/{lv.total}
                        </>
                      ) : (
                        <>🔒 {lv.total}</>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      <button
        onClick={onAll}
        className="mt-1 w-full rounded-xl border border-sb-line bg-sb-card py-2 text-sm font-medium text-sb-muted hover:border-sb-muted"
      >
        Все слова · All words
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-sb-card2 text-sb-muted"}`}>
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
          className="mt-4 block w-full font-semibold text-sb-ink underline"
        >
          Retry
        </button>
      </Centered>
    );
  if (!item) return <Centered onBack={onBack}>loading...</Centered>;

  const meta = [item.part_of_speech, item.gender, item.aspect].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-6">
      <button onClick={onBack} className="mb-4 text-sm text-sb-muted hover:text-sb-ink">
        ← назад · back
      </button>

      <div className="rounded-3xl border border-sb-line bg-sb-card p-6 text-center shadow-xl shadow-black/5">
        <div className="font-display text-5xl font-bold text-sb-ink">{item.stressed_form}</div>
        {item.ipa && <div className="mt-1 text-sm text-sb-muted">/{item.ipa}/</div>}
        <div className="mt-3 text-xl font-semibold text-sb-ink">
          {item.translations.join(", ") || item.translation_primary}
        </div>
        {meta && <div className="mt-1 text-sm text-sb-muted">{meta}</div>}
        <div className="mt-3 flex items-center justify-center gap-2">
          <StatusBadge status={item.status} />
          <span className="text-xs text-sb-muted">Level {item.level}</span>
        </div>
        {item.audio_url && (
          <button
            onClick={() => new Audio(item.audio_url!).play()}
            className="mt-4 rounded-full bg-sb-card2 px-4 py-1.5 text-sm font-semibold text-sb-ink"
          >
            ▶ прослушать · play
          </button>
        )}
        {item.status === "burned" && (
          <div className="mt-4">
            <button
              onClick={doResurrect}
              className="rounded-lg bg-sb-ink px-4 py-1.5 text-sm font-bold text-white"
            >
              Resurrect
            </button>
          </div>
        )}
      </div>

      {item.notes && <p className="mt-4 text-sm text-sb-muted">{item.notes}</p>}

      <Section title="Your synonyms">
        <p className="mb-2 text-xs text-sb-muted">
          Extra meanings you'll also be marked correct for.
        </p>
        {synonyms.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {synonyms.map((syn) => (
              <span
                key={syn}
                className="inline-flex items-center gap-1 rounded-full bg-sb-card2 px-3 py-1 text-sm"
              >
                {syn}
                <button
                  onClick={() => removeSyn(syn)}
                  className="text-sb-muted hover:text-sb-ink"
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
            className="flex-1 rounded-lg border border-sb-line bg-sb-card px-3 py-1.5 text-sm"
          />
          <button
            onClick={addSyn}
            disabled={savingSyn || !newSyn.trim()}
            className="rounded-lg bg-sb-ink px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </Section>

      {item.mnemonic && (item.mnemonic.meaning || item.mnemonic.reading) && (
        <Section title="Your mnemonic">
          {item.mnemonic.meaning && <p className="text-sm text-sb-ink">{item.mnemonic.meaning}</p>}
          {item.mnemonic.reading && <p className="mt-1 text-sm text-sb-ink">{item.mnemonic.reading}</p>}
        </Section>
      )}

      {item.sentences.length > 0 && (
        <Section title="Examples">
          <ul className="space-y-3">
            {item.sentences.map((s, i) => (
              <li key={i}>
                <div className="text-sb-ink">{s.ru}</div>
                <div className="text-sm text-sb-muted">{s.en}</div>
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
            <p className="mt-2 text-center text-xs text-rose-600">flagged as a tricky word</p>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-sb-muted">{title}</h3>
      {children}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sb-line bg-sb-card py-2">
      <div className="font-semibold capitalize text-sb-ink">{value}</div>
      <div className="text-xs text-sb-muted">{label}</div>
    </div>
  );
}

function Centered({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-md px-6 text-center text-sb-muted">
      {children}
      <button onClick={onBack} className="mt-4 block w-full text-sb-muted underline">
        back
      </button>
    </div>
  );
}
