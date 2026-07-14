// Offline persistence in IndexedDB, three stores:
// - reviewQueue: answers recorded offline, drained into POST /reviews/sync
//   (which grades and applies SRS server-side, idempotently on client_event_id).
// - lessonCache: the last successfully fetched lesson list, so a lesson can be
//   studied with no connection.
// - lessonQueue: lesson completions recorded offline, drained into
//   POST /lessons/complete (idempotent: already-started items are skipped).

const DB_NAME = "slonbelka";
const REVIEW_STORE = "reviewQueue";
const LESSON_CACHE = "lessonCache";
const LESSON_QUEUE = "lessonQueue";
const VERSION = 2;

export interface QueuedReview {
  item_id: number;
  question_type: string;
  answer: string;
  client_event_id: string;
  answered_at: string; // ISO
  override: boolean;
}

export interface QueuedLessonCompletion {
  id: string;
  item_ids: number[];
  queued_at: string; // ISO
}

const hasIDB = typeof indexedDB !== "undefined";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REVIEW_STORE)) {
        db.createObjectStore(REVIEW_STORE, { keyPath: "client_event_id" });
      }
      if (!db.objectStoreNames.contains(LESSON_CACHE)) {
        db.createObjectStore(LESSON_CACHE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LESSON_QUEUE)) {
        db.createObjectStore(LESSON_QUEUE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---- review queue ----

export async function enqueue(ev: QueuedReview): Promise<void> {
  if (!hasIDB) return;
  await tx(REVIEW_STORE, "readwrite", (s) => s.put(ev));
}

export async function allQueued(): Promise<QueuedReview[]> {
  if (!hasIDB) return [];
  return (await tx<QueuedReview[]>(REVIEW_STORE, "readonly", (s) => s.getAll())) ?? [];
}

export async function removeQueued(ids: string[]): Promise<void> {
  if (!hasIDB || ids.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(REVIEW_STORE, "readwrite");
    const store = t.objectStore(REVIEW_STORE);
    ids.forEach((id) => store.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function queueCount(): Promise<number> {
  if (!hasIDB) return 0;
  return (await tx<number>(REVIEW_STORE, "readonly", (s) => s.count())) ?? 0;
}

// ---- lesson cache and completion queue ----

export async function cacheLessons(items: unknown[]): Promise<void> {
  if (!hasIDB) return;
  await tx(LESSON_CACHE, "readwrite", (s) =>
    s.put({ id: "lessons", items, cached_at: new Date().toISOString() }),
  );
}

export async function cachedLessons<T>(): Promise<T[] | null> {
  if (!hasIDB) return null;
  const rec = await tx<{ items: T[] } | undefined>(LESSON_CACHE, "readonly", (s) =>
    s.get("lessons"),
  );
  return rec?.items ?? null;
}

export async function clearCachedLessons(): Promise<void> {
  if (!hasIDB) return;
  await tx(LESSON_CACHE, "readwrite", (s) => s.delete("lessons"));
}

export async function enqueueLessonCompletion(item_ids: number[]): Promise<void> {
  if (!hasIDB || item_ids.length === 0) return;
  await tx(LESSON_QUEUE, "readwrite", (s) =>
    s.put({ id: crypto.randomUUID(), item_ids, queued_at: new Date().toISOString() }),
  );
}

export async function allQueuedLessons(): Promise<QueuedLessonCompletion[]> {
  if (!hasIDB) return [];
  return (
    (await tx<QueuedLessonCompletion[]>(LESSON_QUEUE, "readonly", (s) => s.getAll())) ?? []
  );
}

export async function removeQueuedLessons(ids: string[]): Promise<void> {
  if (!hasIDB || ids.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(LESSON_QUEUE, "readwrite");
    const store = t.objectStore(LESSON_QUEUE);
    ids.forEach((id) => store.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
