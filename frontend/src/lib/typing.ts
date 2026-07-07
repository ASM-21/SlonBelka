/**
 * Physical-keyboard support for Russian production answers.
 *
 * Typing a Latin letter produces the matching Cyrillic via the same phonetic
 * mapping as the on-screen phonetic layout, so a hardware keyboard "just
 * types Russian". Users with a real Russian OS layout are unaffected: their
 * keystrokes already arrive as Cyrillic and pass through the input natively.
 */
const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х",
  i: "и", j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "я", r: "р", s: "с", t: "т", u: "у", v: "в", w: "ш", x: "ж",
  y: "ы", z: "з",
};

/** Cyrillic for a pressed key, or null when the key should be left alone. */
export function mapPhysicalKey(key: string): string | null {
  if (key.length !== 1) return null;
  const mapped = LATIN_TO_CYRILLIC[key.toLowerCase()];
  if (!mapped) return null;
  return key === key.toLowerCase() ? mapped : mapped.toUpperCase();
}
