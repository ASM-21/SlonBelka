import { describe, expect, it } from "vitest";
import { gradeMeaning, gradeProduction, levenshtein, normalizeEn, normalizeRu } from "./grading";

// These expectations are pinned against the Python server grader (grading.py).
// If the server rules change, update both sides together.

describe("normalizeRu", () => {
  it("lowercases and strips stress marks", () => {
    expect(normalizeRu("Вода\u0301")).toBe("вода");
  });
  it("maps ё to е", () => {
    expect(normalizeRu("ёж")).toBe("еж");
  });
  it("collapses whitespace", () => {
    expect(normalizeRu("  по   русски ")).toBe("по русски");
  });
});

describe("normalizeEn", () => {
  it("drops a leading article", () => {
    expect(normalizeEn("The Water")).toBe("water");
    expect(normalizeEn("to run")).toBe("run");
    expect(normalizeEn("an apple")).toBe("apple");
  });
});

describe("levenshtein", () => {
  it("counts edits", () => {
    expect(levenshtein("вода", "вода")).toBe(0);
    expect(levenshtein("вода", "вод")).toBe(1);
    expect(levenshtein("вода", "во")).toBe(2);
  });
});

describe("gradeProduction", () => {
  it("exact match", () => expect(gradeProduction("вода", "вода")).toBe("correct"));
  it("ignores stress", () => expect(gradeProduction("вода\u0301", "вода")).toBe("correct"));
  it("ё/е equivalence", () => expect(gradeProduction("еж", "ёж")).toBe("correct"));
  it("one-char typo on a length-4 word is tolerated", () =>
    expect(gradeProduction("вод", "вода")).toBe("correct"));
  it("two off is a near miss", () => expect(gradeProduction("во", "вода")).toBe("near_miss"));
  it("unrelated word is incorrect", () => expect(gradeProduction("собака", "вода")).toBe("incorrect"));
  it("empty answer is incorrect", () => expect(gradeProduction("", "вода")).toBe("incorrect"));
});

describe("gradeMeaning", () => {
  it("exact match", () => expect(gradeMeaning("water", ["water"])).toBe("correct"));
  it("article-insensitive", () => expect(gradeMeaning("the water", ["water"])).toBe("correct"));
  it("typo tolerance", () => expect(gradeMeaning("watar", ["water"])).toBe("correct"));
  it("near miss", () => expect(gradeMeaning("wxtxr", ["water"])).toBe("near_miss"));
  it("wrong meaning is incorrect", () => expect(gradeMeaning("fire", ["water"])).toBe("incorrect"));
  it("matches any candidate in the accept list", () =>
    expect(gradeMeaning("run", ["sprint", "run"])).toBe("correct"));
  it("empty accept list is incorrect", () => expect(gradeMeaning("x", [])).toBe("incorrect"));
});
