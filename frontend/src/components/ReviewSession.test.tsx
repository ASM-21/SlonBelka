import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem, Settings, SubmitResult } from "../lib/api";
import {
  cleanup,
  click,
  getButton,
  getByText,
  getField,
  queryByText,
  render,
  typeInto,
} from "../test/dom";
import ReviewSession from "./ReviewSession";

vi.mock("../lib/api", () => ({
  getReviews: vi.fn(),
  getSettings: vi.fn(),
  submitReview: vi.fn(),
  undoReview: vi.fn(),
  updateSettings: vi.fn(),
  addSynonym: vi.fn(),
  // Imported by ItemInfoPanel, which renders inside the feedback screen.
  getItem: vi.fn(),
  removeSynonym: vi.fn(),
  saveMnemonic: vi.fn(),
}));
// Deterministic question order: the real shuffle would randomize it.
vi.mock("../lib/shuffle", () => ({
  shuffle: (a: unknown[]) => a,
  spreadPairs: (a: unknown[]) => a,
}));
vi.mock("../lib/offlineQueue", () => ({ enqueue: vi.fn() }));
vi.mock("../lib/sync", () => ({ drainQueue: vi.fn() }));

import { getItem, getReviews, getSettings, submitReview, undoReview } from "../lib/api";
import type { ItemDetail } from "../lib/api";
import { enqueue } from "../lib/offlineQueue";
import { drainQueue } from "../lib/sync";

const itemDetail: ItemDetail = {
  id: 1,
  lemma: "привет",
  stressed_form: "приве́т",
  translation_primary: "hello",
  part_of_speech: "noun",
  level: 1,
  frequency_rank: 1,
  status: "apprentice",
  srs_stage: 1,
  available_at: null,
  is_leech: false,
  accessible: true,
  translations: ["hello", "hi"],
  synonyms: [],
  sentences: [],
  mnemonic: null,
  notes: null,
};

const settings: Settings = {
  daily_lesson_cap: 10,
  autoplay_audio: false,
  keyboard_layout: "jcuken",
  onboarded: true,
  reminders_enabled: true,
  reminder_hour: -1,
  quiet_hours_enabled: false,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  session_size: 0,
  frozen: false,
};

const review = (id: number, prompt: string): ReviewItem => ({
  item_id: id,
  question_type: "meaning",
  prompt,
});

const result = (over: Partial<SubmitResult> = {}): SubmitResult => ({
  status: "correct",
  correct: true,
  srs_stage: 2,
  srs_stage_before: 1,
  srs_stage_name: "Apprentice 2",
  srs_stage_before_name: "Apprentice 1",
  available_at: null,
  pass_complete: true,
  passed: false,
  burned: false,
  expected: "hello",
  stressed_form: "приве́т",
  ...over,
});

function setup(reviews: ReviewItem[], s: Settings = settings) {
  vi.mocked(getReviews).mockResolvedValue(reviews);
  vi.mocked(getSettings).mockResolvedValue(s);
  // The info panel auto-opens on a miss and fetches the item detail.
  vi.mocked(getItem).mockResolvedValue(itemDetail);
  return render(<ReviewSession onDone={() => {}} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReviewSession", () => {
  it("shows the empty state when nothing is due", async () => {
    await setup([]);
    getByText(/Nothing due right now/);
  });

  it("grades a correct answer and ends with a session summary", async () => {
    vi.mocked(submitReview).mockResolvedValue(result());
    await setup([review(1, "привет")]);

    getByText("привет");
    await typeInto(getField("English meaning"), "hello");
    await click(getButton(/Проверить/));

    getByText(/Верно · Correct/);
    expect(submitReview).toHaveBeenCalledTimes(1);
    expect(vi.mocked(submitReview).mock.calls[0][0]).toMatchObject({
      item_id: 1,
      question_type: "meaning",
      answer: "hello",
      override: false,
    });

    await click(getButton(/Дальше/));
    getByText(/Reviews done/);
    getByText("Words cleared");
    expect(drainQueue).not.toHaveBeenCalled();
  });

  it("requeues a miss and lets a typo be marked correct", async () => {
    vi.mocked(submitReview).mockResolvedValue(
      result({ status: "incorrect", correct: false, srs_stage: 1 }),
    );
    vi.mocked(undoReview).mockResolvedValue(result());
    await setup([review(1, "привет")]);

    await typeInto(getField("English meaning"), "helo!!");
    await click(getButton(/Проверить/));
    getByText(/Не совсем · Not quite/);

    await click(getButton(/Mark correct/));
    getByText(/Верно · Correct/);
    const eventId = vi.mocked(submitReview).mock.calls[0][0].client_event_id;
    expect(undoReview).toHaveBeenCalledWith(eventId);

    // The undone answer counts as correct, so continue finishes the session.
    await click(getButton(/Дальше/));
    getByText(/Reviews done/);
  });

  it("offers a near-miss retry and accepts on override", async () => {
    vi.mocked(submitReview)
      .mockResolvedValueOnce(result({ status: "near_miss", correct: false }))
      .mockResolvedValueOnce(result({ status: "override" }));
    await setup([review(1, "привет")]);

    await typeInto(getField("English meaning"), "helo");
    await click(getButton(/Проверить/));
    getByText(/Almost!/);

    await click(getButton(/засчитать/));
    getByText(/Верно · Correct/);
    expect(vi.mocked(submitReview).mock.calls[1][0]).toMatchObject({ override: true });
  });

  it("caps the session to the configured word count", async () => {
    await setup(
      [review(1, "слово-один"), review(2, "слово-два")],
      { ...settings, session_size: 1 },
    );
    getByText(/1 left/);
    getByText("слово-один");
    expect(queryByText("слово-два")).toBeNull();
  });

  it("auto-opens word details on a miss and keeps them closed when correct", async () => {
    vi.mocked(submitReview).mockResolvedValueOnce(
      result({ status: "incorrect", correct: false, srs_stage: 1 }),
    );
    await setup([review(1, "привет")]);

    await typeInto(getField("English meaning"), "wrong");
    await click(getButton(/Проверить/));
    // Panel content is visible without pressing "Show details".
    getByText("Your synonyms");
    expect(queryByText(/Show details/)).toBeNull();

    // Re-queued question, this time answered correctly: panel stays closed.
    vi.mocked(submitReview).mockResolvedValueOnce(result());
    await click(getButton(/Дальше/));
    await typeInto(getField("English meaning"), "hello");
    await click(getButton(/Проверить/));
    getByText(/Верно · Correct/);
    expect(queryByText("Your synonyms")).toBeNull();
    getByText(/Show details/);
  });

  it("shows a quick-added synonym in the details panel list", async () => {
    vi.mocked(submitReview).mockResolvedValue(
      result({ status: "incorrect", correct: false, srs_stage: 1 }),
    );
    const { addSynonym } = await import("../lib/api");
    vi.mocked(addSynonym).mockResolvedValue({ synonyms: ["greetings"] });
    await setup([review(1, "привет")]);

    await typeInto(getField("English meaning"), "greetings");
    await click(getButton(/Проверить/));
    await click(getButton(/Accept "greetings" next time/));
    getByText(/Added "greetings" as a synonym/);
    // The panel's synonym list (auto-opened by the miss) shows it too: the
    // chip carries a remove button labeled after the synonym.
    getButton(/remove greetings/);
  });

  it("queues the answer offline when the request fails, then syncs at the end", async () => {
    vi.mocked(submitReview).mockRejectedValue(new Error("network down"));
    await setup([review(1, "привет")]);

    await typeInto(getField("English meaning"), "hello");
    await click(getButton(/Проверить/));

    getByText(/Saved offline/);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueue).mock.calls[0][0]).toMatchObject({
      item_id: 1,
      question_type: "meaning",
      answer: "hello",
    });

    await click(getButton(/Дальше/));
    getByText(/1 answered offline/);
    expect(drainQueue).toHaveBeenCalled();
  });
});
