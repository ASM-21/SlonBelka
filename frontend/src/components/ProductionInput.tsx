import { useRef } from "react";
import { mapPhysicalKey } from "../lib/typing";
import CyrillicKeyboard, { Layout } from "./CyrillicKeyboard";

/**
 * Russian answer input shared by the review, lesson, and practice sessions.
 * A real focused input, so a hardware keyboard types (Latin letters map to
 * Cyrillic phonetically, a Russian OS layout passes through) and Enter
 * submits, while the on-screen keyboard keeps working and writes into the
 * same value. inputMode="none" keeps the mobile OS keyboard suppressed.
 */
export default function ProductionInput({
  value,
  onChange,
  onSubmit,
  layout,
  onToggleLayout,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  layout?: Layout;
  onToggleLayout?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) {
      onChange(value + ch);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    onChange(el.value.slice(0, start) + ch + el.value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (!e.repeat && value) onSubmit();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const mapped = mapPhysicalKey(e.key);
    if (mapped) {
      e.preventDefault();
      insert(mapped);
    }
  };

  return (
    <>
      {/* The accent border mirrors the prompt card's accent tint: this input
          answers in Russian (the meaning input carries the gold tint). */}
      <input
        ref={ref}
        autoFocus
        aria-label="Your answer in Russian"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        inputMode="none"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="…"
        className="mb-3 w-full rounded-xl border-2 border-sb-accent-soft bg-sb-card px-3 py-3 text-center text-2xl outline-none focus:border-sb-accent"
      />
      <CyrillicKeyboard
        onKey={insert}
        onBackspace={() => onChange(value.slice(0, -1))}
        layout={layout}
        onToggleLayout={onToggleLayout}
      />
    </>
  );
}
