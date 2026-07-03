// Drains the offline review queue into the server. Safe to call repeatedly:
// the sync endpoint is idempotent on client_event_id, and a single-flight guard
// prevents overlapping drains.

import { syncReviews } from "./api";
import { allQueued, removeQueued } from "./offlineQueue";

let draining = false;

export async function drainQueue(): Promise<number> {
  if (draining) return 0;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  draining = true;
  try {
    const queued = await allQueued();
    if (queued.length === 0) return 0;
    const res = await syncReviews(queued);
    // Every event that came back with a result was processed (errors included,
    // e.g. an item no longer due — those will never succeed, so don't retry).
    const processed = res.results.map((r) => r.client_event_id);
    await removeQueued(processed);
    window.dispatchEvent(new CustomEvent("slonbelka:synced", { detail: { count: processed.length } }));
    return processed.length;
  } catch {
    return 0; // offline or server error: keep the queue for next time
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
