import { beforeEach, describe, expect, it } from "vitest";
import { allQueued, enqueue, queueCount, removeQueued, QueuedReview } from "./offlineQueue";

const ev = (id: string): QueuedReview => ({
  item_id: 1,
  question_type: "meaning",
  answer: "x",
  client_event_id: id,
  answered_at: new Date().toISOString(),
  override: false,
});

async function clearAll() {
  const all = await allQueued();
  await removeQueued(all.map((e) => e.client_event_id));
}

describe("offlineQueue", () => {
  beforeEach(clearAll);

  it("enqueues and lists events", async () => {
    await enqueue(ev("a"));
    await enqueue(ev("b"));
    const all = await allQueued();
    expect(all.map((e) => e.client_event_id).sort()).toEqual(["a", "b"]);
    expect(await queueCount()).toBe(2);
  });

  it("is keyed by client_event_id (re-put overwrites, no duplicates)", async () => {
    await enqueue(ev("a"));
    await enqueue(ev("a"));
    expect(await queueCount()).toBe(1);
  });

  it("removes specific events by id", async () => {
    await enqueue(ev("a"));
    await enqueue(ev("b"));
    await removeQueued(["a"]);
    const all = await allQueued();
    expect(all.map((e) => e.client_event_id)).toEqual(["b"]);
  });

  it("remove with empty list is a no-op", async () => {
    await enqueue(ev("a"));
    await removeQueued([]);
    expect(await queueCount()).toBe(1);
  });
});
