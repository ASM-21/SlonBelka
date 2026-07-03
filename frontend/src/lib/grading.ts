// Client-side port of the server's grading rules (backend/app/grading.py).
// Kept faithful so the lesson quiz grades identically to reviews. If you change
// one side, change the other.

export type Grade = "correct" | "near_miss" | "incorrect";

const COMBINING_ACUTE = "\u0301";

/** Lowercase, map ё to е, strip stress marks, collapse whitespace. */
export function normalizeRu(text: string): string {
  let t = text.trim().toLowerCase().replace(/ё/g, "е");
  t = t.normalize("NFD").split(COMBINING_ACUTE).join("").normalize("NFC");
  return t.split(/\s+/).filter(Boolean).join(" ");
}

/** Lowercase, trim, drop a leading article, collapse whitespace. */
export function normalizeEn(text: string): string {
  let t = text.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  for (const article of ["to ", "the ", "a ", "an "]) {
    if (t.startsWith(article)) {
      t = t.slice(article.length);
      break;
    }
  }
  return t;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = cur;
  }
  return prev[b.length];
}

function tolerance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

function gradeAgainst(answer: string, candidates: string[]): Grade {
  if (!answer) return "incorrect";
  if (candidates.includes(answer)) return "correct";
  const best = Math.min(...candidates.map((c) => levenshtein(answer, c)));
  const closestLen = Math.min(...candidates.map((c) => c.length));
  const tol = tolerance(closestLen);
  if (best <= tol) return "correct";
  if (best <= tol + 1) return "near_miss";
  return "incorrect";
}

/** Grade an English meaning answer against the accept-list. */
export function gradeMeaning(answer: string, acceptList: string[]): Grade {
  const a = normalizeEn(answer);
  const candidates = acceptList.filter((c) => c.trim()).map(normalizeEn);
  if (candidates.length === 0) return "incorrect";
  return gradeAgainst(a, candidates);
}

/** Grade a Russian production answer against the lemma (stress-insensitive). */
export function gradeProduction(answer: string, lemma: string, altForms: string[] = []): Grade {
  const a = normalizeRu(answer);
  const candidates = [normalizeRu(lemma), ...altForms.map(normalizeRu)];
  return gradeAgainst(a, candidates);
}
