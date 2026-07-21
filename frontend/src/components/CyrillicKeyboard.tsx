import { useRef, useState } from "react";

/**
 * On-screen Cyrillic keyboard for production reviews. Guarantees Cyrillic input
 * without relying on the device OS keyboard, and doubles as a visual alphabet
 * reference (long-press any key to see its name and sound).
 *
 * Not runtime-verified in this scaffold (no browser here); standard React + Tailwind.
 */

export type Layout = "jcuken" | "phonetic";

// Standard Russian JCUKEN layout.
const JCUKEN: string[][] = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ъ"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "ё"],
];

// Homophonic layout in QWERTY order, easier for beginners (still inputs Cyrillic).
const PHONETIC: string[][] = [
  ["я", "ш", "е", "р", "т", "ы", "у", "и", "о", "п"],
  ["а", "с", "д", "ф", "г", "х", "й", "к", "л"],
  ["з", "ж", "ц", "в", "б", "н", "м", "ч", "ё"],
];

// Letter name + rough English sound, shown on long-press.
const HINTS: Record<string, string> = {
  а: "a — father", б: "be — b", в: "ve — v", г: "ge — g", д: "de — d",
  е: "ye — yet", ё: "yo — yonder", ж: "zhe — pleasure", з: "ze — z", и: "i — machine",
  й: "i kratkoye — boy", к: "ka — k", л: "el — l", м: "em — m", н: "en — n",
  о: "o — more", п: "pe — p", р: "er — rolled r", с: "es — s", т: "te — t",
  у: "u — boot", ф: "ef — f", х: "kha — loch", ц: "tse — cats", ч: "che — chair",
  ш: "sha — sh", щ: "shcha — fresh cheese", ъ: "hard sign", ы: "y — roses",
  ь: "soft sign", э: "e — met", ю: "yu — universe", я: "ya — yard",
};

interface Props {
  onKey: (ch: string) => void;
  onBackspace: () => void;
  layout?: Layout;
  onToggleLayout?: () => void;
}

export default function CyrillicKeyboard({
  onKey,
  onBackspace,
  layout,
  onToggleLayout,
}: Props) {
  const [internalLayout, setInternalLayout] = useState<Layout>("jcuken");
  const active = layout ?? internalLayout;
  const rows = active === "jcuken" ? JCUKEN : PHONETIC;

  const [hint, setHint] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);

  const startHold = (ch: string) => {
    holdTimer.current = window.setTimeout(() => setHint(HINTS[ch] ?? ch), 350);
  };
  const endHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    setHint(null);
  };

  const toggle = () => {
    if (onToggleLayout) onToggleLayout();
    else setInternalLayout((l) => (l === "jcuken" ? "phonetic" : "jcuken"));
  };

  return (
    <div className="select-none rounded-2xl bg-sb-card2 p-2">
      <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-sb-muted">
        <span>{active === "jcuken" ? "ЙЦУКЕН · JCUKEN" : "Фонетическая · Phonetic"}</span>
        <button
          type="button"
          onClick={toggle}
          className="rounded px-2 py-0.5 font-bold text-sb-accent hover:bg-sb-line"
        >
          сменить раскладку · switch
        </button>
      </div>

      <div className="relative" role="group" aria-label="Cyrillic keyboard">
        {hint && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg bg-sb-ink px-3 py-1 text-sm text-white shadow">
            {hint}
          </div>
        )}

        {rows.map((row, i) => (
          <div key={i} className="mb-1.5 flex justify-center gap-0.5 sm:gap-1">
            {row.map((ch) => (
              <button
                key={ch}
                type="button"
                aria-label={HINTS[ch] ? `${ch}, ${HINTS[ch]}` : ch}
                onClick={() => onKey(ch)}
                onMouseDown={() => startHold(ch)}
                onMouseUp={endHold}
                onMouseLeave={endHold}
                onTouchStart={() => startHold(ch)}
                onTouchEnd={endHold}
                className="h-11 min-w-0 flex-1 rounded-lg bg-sb-card text-base shadow-sm
                           active:bg-sb-line sm:text-lg"
              >
                {ch}
              </button>
            ))}
            {/* Backspace rides the last letter row so every key, letters and
                all, shares one grid; submission lives in the session's own
                Check button below the keyboard. */}
            {i === rows.length - 1 && (
              <button
                type="button"
                aria-label="Backspace"
                onClick={onBackspace}
                className="h-11 min-w-0 flex-[1.5] rounded-lg bg-sb-card2 text-base shadow-sm
                           active:bg-sb-line"
              >
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
