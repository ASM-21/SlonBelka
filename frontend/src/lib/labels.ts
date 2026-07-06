// User-facing names that appear in several places, kept in one spot.

// The "problem words" surface (SRS leeches). The API keeps the leech naming;
// only the UI label changed.
export const LEECH_LABEL = "Tricky words";
export const LEECH_LABEL_RU = "Трудные слова";

// Full display names for the SRS bands (the API uses the lowercase keys).
export const BAND_LABELS: Record<string, string> = {
  apprentice: "Apprentice",
  guru: "Guru",
  master: "Master",
  enlightened: "Enlightened",
  burned: "Burned",
};

// Russian band names as used in the design's stats breakdown (long ones
// abbreviated the same way the mock abbreviates them).
export const BAND_LABELS_RU: Record<string, string> = {
  apprentice: "Ученик",
  guru: "Гуру",
  master: "Мастер",
  enlightened: "Просветл.",
  burned: "Сожжён.",
};

// Named bands of ten levels for the dictionary grid (WaniKani-style).
// Placeholder names, adjust to taste; levels past the last band reuse it.
export const LEVEL_BANDS: { ru: string; en: string }[] = [
  { ru: "Росток", en: "Sprout" },
  { ru: "Орех", en: "Nut" },
  { ru: "Белка", en: "Squirrel" },
  { ru: "Слон", en: "Elephant" },
  { ru: "Память", en: "Memory" },
];

export const levelBand = (level: number) =>
  LEVEL_BANDS[Math.min(Math.floor((level - 1) / 10), LEVEL_BANDS.length - 1)];
