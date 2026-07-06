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
