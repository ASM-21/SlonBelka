import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ syncReviews: vi.fn() }));
vi.mock("./offlineQueue", () => ({ allQueued: vi.fn(), removeQueued: vi.fn() }));

import { syncReviews } from "./api";
import { allQueued, removeQueued } from "./offlineQueue";
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

describe("drainQueue", () => {
  it("no-ops when the queue is empty", async () => {
    vi.mocked(allQueued).mockResolvedValue([]);
    expect(await drainQueue()).toBe(0);
    expect(syncReviews).not.toHaveBeenCalled();
  });

  it("syncs queued events and removes the processed ones", async () => {
    vi.mocked(allQueued).mockResolvedValue([q("a"), q("b")]);
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
    vi.mocked(syncReviews).mockRejectedValue(new Error("offline"));
    expect(await drainQueue()).toBe(0);
    expect(removeQueued).not.toHaveBeenCalled();
  });
});
