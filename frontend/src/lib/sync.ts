// Drains the offline queues into the server. Safe to call repeatedly: the
// review sync endpoint is idempotent on client_event_id, lesson completion
// skips already-started items, and a single-flight guard prevents overlapping
// drains.

import { completeLessons, syncReviews } from "./api";
import {
  allQueued,
  allQueuedLessons,
  removeQueued,
  removeQueuedLessons,
} from "./offlineQueue";

let draining = false;

export async function drainQueue(): Promise<number> {
  if (draining) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  draining = true;
  try {
    let processedCount = 0;

    const queued = await allQueued();
    if (queued.length > 0) {
      const res = await syncReviews(queued);
      // Every event that came back with a result was processed (errors included,
      // e.g. an item no longer due — those will never succeed, so don't retry).
      const processed = res.results.map((r) => r.client_event_id);
      await removeQueued(processed);
      processedCount += processed.length;
    }

    const lessonBatches = await allQueuedLessons();
    for (const batch of lessonBatches) {
      await completeLessons(batch.item_ids);
      await removeQueuedLessons([batch.id]);
      processedCount += 1;
    }

    if (processedCount > 0) {
      window.dispatchEvent(
        new CustomEvent("slonbelka:synced", { detail: { count: processedCount } }),
      );
    }
    return processedCount;
  } catch {
    return 0; // offline or server error: keep the queues for next time
  } finally {
    draining = false;
  }
}

export function initSync(): void {
  if (typeof window === "undefined") return;
  drainQueue();
  window.addEventListener("online", () => {
    drainQueue();
  });
}
