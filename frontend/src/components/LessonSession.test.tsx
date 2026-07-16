import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonItem, Settings } from "../lib/api";
import {
  cleanup,
  click,
  getButton,
  getByText,
  getField,
  keyDown,
  render,
  typeInto,
} from "../test/dom";
import LessonSession from "./LessonSession";

vi.mock("../lib/api", () => ({
  getLessons: vi.fn(),
  completeLessons: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
// Deterministic question order: meaning first, then production.
vi.mock("../lib/shuffle", () => ({
  shuffle: (a: unknown[]) => a,
  spreadPairs: (a: unknown[]) => a,
}));
vi.mock("../lib/offlineQueue", () => ({
  cacheLessons: vi.fn(),
  cachedLessons: vi.fn(),
  clearCachedLessons: vi.fn(),
  enqueueLessonCompletion: vi.fn(),
}));

import { completeLessons, getLessons, getSettings } from "../lib/api";
import {
  cacheLessons,
  cachedLessons,
  clearCachedLessons,
  enqueueLessonCompletion,
} from "../lib/offlineQueue";

const settings: Settings = {
  daily_lesson_cap: 10,
  autoplay_audio: false,
  keyboard_layout: "jcuken",
  onboarded: true,
  reminders_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  session_size: 0,
  frozen: false,
};

const word: LessonItem = {
  id: 1,
  type: "vocab",
  level: 1,
  lemma: "привет",
  stressed_form: "приве́т",
  translation_primary: "hello",
  translations: ["hello", "hi"],
  part_of_speech: "noun",
};

function setup(items: LessonItem[]) {
  vi.mocked(getLessons).mockResolvedValue(items);
  vi.mocked(getSettings).mockResolvedValue(settings);
  return render(<LessonSession onDone={() => {}} />);
}

/** Answer the meaning question (graded locally against `translations`). */
async function answerMeaning(text: string) {
  await typeInto(getField("English meaning"), text);
  await click(getButton(/Проверить/));
}

/** Answer the production question by typing Russian and pressing Enter. */
async function answerProduction(text: string) {
  const field = getField("Your answer in Russian");
  await typeInto(field, text);
  await keyDown(field, "Enter");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LessonSession", () => {
  it("shows the empty state when there are no lessons", async () => {
    await setup([]);
    getByText(/No new lessons right now/);
  });

  it("walks info cards, quizzes both directions, and commits the lesson", async () => {
    vi.mocked(completeLessons).mockResolvedValue({ started: [1], over_cap: [], skipped: [] });
    await setup([word]);

    // Info card for the only word, then straight into the quiz.
    getByText("приве́т");
    expect(cacheLessons).toHaveBeenCalledWith([word]);
    await click(getButton(/Начать квиз/));

    // Question 1: meaning, graded by the local grader.
    getByText(/Meaning/);
    await answerMeaning("hello");
    getByText(/Верно · Correct/);
    await click(getButton(/Дальше/));

    // Question 2: production, Enter submits.
    getByText(/Type in Russian/);
    await answerProduction("привет");
    getByText(/Верно · Correct/);
    await click(getButton(/Дальше/));

    // Both cleared: the lesson commits and the summary shows.
    getByText(/Lesson complete/);
    expect(completeLessons).toHaveBeenCalledWith([1]);
    expect(clearCachedLessons).toHaveBeenCalled();
    getByText("100%"); // quiz accuracy, both first attempts correct
  });

  it("re-drills a missed question before finishing", async () => {
    vi.mocked(completeLessons).mockResolvedValue({ started: [1], over_cap: [], skipped: [] });
    await setup([word]);
    await click(getButton(/Начать квиз/));

    await answerMeaning("zzzzzz");
    getByText(/You'll see this again/);
    await click(getButton(/Дальше/));

    // The miss went to the back of the queue: production comes next,
    // then the meaning question returns.
    getByText(/Type in Russian/);
    await answerProduction("привет");
    await click(getButton(/Дальше/));
    getByText(/Meaning/);
    await answerMeaning("hello");
    await click(getButton(/Дальше/));

    getByText(/Lesson complete/);
    getByText("50%"); // one of two first attempts was wrong
  });

  it("falls back to cached lessons and queues the completion offline", async () => {
    vi.mocked(getLessons).mockRejectedValue(new Error("offline"));
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(cachedLessons).mockResolvedValue([word]);
    vi.mocked(completeLessons).mockRejectedValue(new Error("offline"));
    await render(<LessonSession onDone={() => {}} />);

    getByText("приве́т");
    await click(getButton(/Начать квиз/));
    await answerMeaning("hello");
    await click(getButton(/Дальше/));
    await answerProduction("привет");
    await click(getButton(/Дальше/));

    getByText(/Lesson complete/);
    getByText(/Saved offline/);
    expect(enqueueLessonCompletion).toHaveBeenCalledWith([1]);
    expect(clearCachedLessons).toHaveBeenCalled();
  });
});
