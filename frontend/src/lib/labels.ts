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
// A growth metaphor, sprout to forest. Deliberately avoids Белка/Слон so the
// brand animals stay branding (the words themselves can still be vocabulary).
export const LEVEL_BANDS: { ru: string; en: string }[] = [
  { ru: "Росток", en: "Sprout" },
  { ru: "Саженец", en: "Sapling" },
  { ru: "Дерево", en: "Tree" },
  { ru: "Роща", en: "Grove" },
  { ru: "Лес", en: "Forest" },
];

export const levelBand = (level: number) =>
  LEVEL_BANDS[Math.min(Math.floor((level - 1) / 10), LEVEL_BANDS.length - 1)];
