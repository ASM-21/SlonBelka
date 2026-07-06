import { describe, expect, it } from "vitest";
import { shuffle, spreadPairs } from "./shuffle";

const sorted = <T,>(a: readonly T[]) => [...a].sort();

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const out = shuffle(input);
    expect(input).toEqual(copy);
    expect(sorted(out)).toEqual(sorted(input));
  });

  it("produces more than one ordering across runs", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const seen = new Set(Array.from({ length: 30 }, () => shuffle(input).join(",")));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([42])).toEqual([42]);
  });
});

describe("spreadPairs", () => {
  const adjacencies = <T,>(items: T[], key: (x: T) => unknown) =>
    items.filter((x, i) => i > 0 && key(x) === key(items[i - 1])).length;

  it("separates adjacent entries with the same key when possible", () => {
    const input = [
      { id: 1, t: "meaning" },
      { id: 1, t: "production" },
      { id: 2, t: "meaning" },
      { id: 2, t: "production" },
    ];
    const out = spreadPairs(input, (q) => q.id);
    expect(adjacencies(out, (q) => q.id)).toBe(0);
    expect(sorted(out.map((q) => `${q.id}:${q.t}`))).toEqual(sorted(input.map((q) => `${q.id}:${q.t}`)));
  });

  it("leaves an unresolvable tail adjacent (best effort)", () => {
    const out = spreadPairs([1, 1, 1, 2], (x) => x);
    expect(sorted(out)).toEqual([1, 1, 1, 2]);
    // Only the final pair of ones can remain adjacent.
    expect(adjacencies(out, (x) => x)).toBeLessThanOrEqual(1);
  });

  it("no-ops on already spread input", () => {
    expect(spreadPairs([1, 2, 1, 2], (x) => x)).toEqual([1, 2, 1, 2]);
  });

  it("handles empty arrays", () => {
    expect(spreadPairs([], (x) => x)).toEqual([]);
  });
});
