import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ syncReviews: vi.fn(), completeLessons: vi.fn() }));
vi.mock("./offlineQueue", () => ({
  allQueued: vi.fn(),
  removeQueued: vi.fn(),
  allQueuedLessons: vi.fn(),
  removeQueuedLessons: vi.fn(),
}));

import { completeLessons, syncReviews } from "./api";
import {
  allQueued,
  allQueuedLessons,
  removeQueued,
  removeQueuedLessons,
} from "./offlineQueue";
import { drainQueue } from "./sync";

const q = (id: string) => ({
  item_id: 1,
  question_type: "meaning",
  answer: "x",
  client_event_id: id,
  answered_at: "2026-01-01T00:00:00Z",
  override: false,
});

afterEach(() => vi.clearAllMocks());

function noLessons() {
  vi.mocked(allQueuedLessons).mockResolvedValue([]);
}

describe("drainQueue", () => {
  it("no-ops when the queues are empty", async () => {
    vi.mocked(allQueued).mockResolvedValue([]);
    noLessons();
    expect(await drainQueue()).toBe(0);
    expect(syncReviews).not.toHaveBeenCalled();
    expect(completeLessons).not.toHaveBeenCalled();
  });

  it("syncs queued events and removes the processed ones", async () => {
    vi.mocked(allQueued).mockResolvedValue([q("a"), q("b")]);
    noLessons();
    vi.mocked(syncReviews).mockResolvedValue({
      results: [
        { client_event_id: "a", status: "correct" },
        { client_event_id: "b", status: "incorrect" },
      ],
    });
    expect(await drainQueue()).toBe(2);
    expect(syncReviews).toHaveBeenCalledOnce();
    expect(removeQueued).toHaveBeenCalledWith(["a", "b"]);
  });

  it("keeps the queue when the sync request fails", async () => {
    vi.mocked(allQueued).mockResolvedValue([q("a")]);
    noLessons();
    vi.mocked(syncReviews).mockRejectedValue(new Error("offline"));
    expect(await drainQueue()).toBe(0);
    expect(removeQueued).not.toHaveBeenCalled();
  });

  it("drains queued lesson completions", async () => {
    vi.mocked(allQueued).mockResolvedValue([]);
    vi.mocked(allQueuedLessons).mockResolvedValue([
      { id: "b1", item_ids: [1, 2], queued_at: "2026-01-01T00:00:00Z" },
    ]);
    vi.mocked(completeLessons).mockResolvedValue({ started: [1, 2], over_cap: [], skipped: [] });
    expect(await drainQueue()).toBe(1);
    expect(completeLessons).toHaveBeenCalledWith([1, 2]);
    expect(removeQueuedLessons).toHaveBeenCalledWith(["b1"]);
  });

  it("keeps lesson completions when the request fails", async () => {
    vi.mocked(allQueued).mockResolvedValue([]);
    vi.mocked(allQueuedLessons).mockResolvedValue([
      { id: "b1", item_ids: [1], queued_at: "2026-01-01T00:00:00Z" },
    ]);
    vi.mocked(completeLessons).mockRejectedValue(new Error("offline"));
    expect(await drainQueue()).toBe(0);
    expect(removeQueuedLessons).not.toHaveBeenCalled();
  });
});
