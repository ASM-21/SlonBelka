/** Fisher-Yates shuffle. Returns a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Best-effort pass so entries sharing a key are not adjacent (e.g. the two
 * question types of one word back to back after a shuffle). Each conflicting
 * entry is swapped with the next entry that has a different key; a tail of
 * same-key entries with no swap candidate is left adjacent.
 */
export function spreadPairs<T>(items: readonly T[], keyFn: (item: T) => unknown): T[] {
  const out = [...items];
  for (let i = 1; i < out.length; i++) {
    if (keyFn(out[i]) !== keyFn(out[i - 1])) continue;
    for (let j = i + 1; j < out.length; j++) {
      if (keyFn(out[j]) !== keyFn(out[i - 1])) {
        [out[i], out[j]] = [out[j], out[i]];
        break;
      }
    }
  }
  return out;
}
