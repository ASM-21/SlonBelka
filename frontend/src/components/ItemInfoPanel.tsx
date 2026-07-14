import { useEffect, useState } from "react";
import { addSynonym, getItem, removeSynonym, saveMnemonic } from "../lib/api";
import { useFetch } from "../lib/useFetch";

/**
 * Expandable word details for the session feedback screens: meanings, word
 * type, audio, user synonyms, examples, and a personal mnemonic. Fetches
 * lazily so a session only pays for it when the learner opens it.
 */
export default function ItemInfoPanel({ itemId }: { itemId: number }) {
  const { status, data: item, retry } = useFetch(() => getItem(itemId), [itemId]);
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [newSyn, setNewSyn] = useState("");
  const [savingSyn, setSavingSyn] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicSaved, setMnemonicSaved] = useState(true);

  useEffect(() => {
    if (item) {
      setSynonyms(item.synonyms);
      setMnemonic(item.mnemonic?.meaning ?? "");
      setMnemonicSaved(true);
    }
  }, [item]);

  if (status === "loading")
    return (
      <Panel>
        <p className="py-2 text-center text-sm text-sb-muted">loading details...</p>
      </Panel>
    );
  if (status === "error" || !item)
    return (
      <Panel>
        <p className="py-2 text-center text-sm text-sb-muted">
          Couldn't load details.{" "}
          <button onClick={retry} className="font-medium underline">
            Retry
          </button>
        </p>
      </Panel>
    );

  const alternatives = item.translations.filter((t) => t !== item.translation_primary);
  const meta = [item.part_of_speech, item.gender, item.aspect].filter(Boolean).join(" · ");

  const addSyn = async () => {
    const text = newSyn.trim();
    if (!text) return;
    setSavingSyn(true);
    try {
      const { synonyms: next } = await addSynonym(itemId, text);
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
      const { synonyms: next } = await removeSynonym(itemId, text);
      setSynonyms(next);
    } catch {
      /* chip stays; the user can retry */
    }
  };

  const saveMnem = async () => {
    try {
      await saveMnemonic(itemId, { meaning_mnemonic: mnemonic.trim() });
      setMnemonicSaved(true);
    } catch {
      /* button stays enabled for another try */
    }
  };

  return (
    <Panel>
      <Row label="Meaning">
        <span className="font-medium">{item.translation_primary}</span>
        {alternatives.length > 0 && (
          <span className="text-sb-muted">, {alternatives.join(", ")}</span>
        )}
      </Row>

      {meta && <Row label="Word type">{meta}</Row>}
      {item.ipa && <Row label="Pronunciation">/{item.ipa}/</Row>}

      {item.audio_url && (
        <Row label="Audio">
          <button
            onClick={() => new Audio(item.audio_url!).play()}
            className="rounded-full bg-sb-card2 px-3 py-1 text-sm font-semibold"
          >
            ▶ прослушать · play
          </button>
          {item.audio_attribution && (
            <div className="mt-1 text-[11px] text-sb-muted">
              {item.audio_attribution.source === "tts"
                ? "Generated pronunciation (TTS)"
                : [item.audio_attribution.attribution, item.audio_attribution.license]
                    .filter(Boolean)
                    .join(" · ") || "Recording via Wikimedia Commons"}
            </div>
          )}
        </Row>
      )}

      <Row label="Your synonyms">
        {synonyms.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {synonyms.map((syn) => (
              <span
                key={syn}
                className="inline-flex items-center gap-1 rounded-full bg-sb-card2 px-2.5 py-0.5 text-sm"
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
            placeholder="add an accepted meaning"
            className="min-w-0 flex-1 rounded-lg border border-sb-line bg-white px-2.5 py-1 text-sm"
          />
          <button
            onClick={addSyn}
            disabled={savingSyn || !newSyn.trim()}
            className="rounded-lg bg-sb-ink px-3 py-1 text-sm font-bold text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </Row>

      {item.sentences.length > 0 && (
        <Row label="Examples">
          <ul className="space-y-2">
            {item.sentences.map((s, i) => (
              <li key={i}>
                <div className="text-sb-ink">{s.ru}</div>
                <div className="text-xs text-sb-muted">{s.en}</div>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 text-[11px] text-sb-muted">
            Sentences from Tatoeba.org · CC BY 2.0 FR
          </div>
        </Row>
      )}

      <Row label="Your mnemonic">
        <textarea
          value={mnemonic}
          onChange={(e) => {
            setMnemonic(e.target.value);
            setMnemonicSaved(false);
          }}
          placeholder="a hook to remember this word"
          rows={2}
          className="w-full rounded-lg border border-sb-line bg-white px-2.5 py-1.5 text-sm"
        />
        <button
          onClick={saveMnem}
          disabled={mnemonicSaved}
          className="mt-1 rounded-lg bg-sb-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
        >
          {mnemonicSaved ? "saved" : "save"}
        </button>
      </Row>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-2xl border border-sb-line bg-sb-card p-4 text-left">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-sb-muted">{label}</div>
      <div className="text-sm text-sb-ink">{children}</div>
    </div>
  );
}
