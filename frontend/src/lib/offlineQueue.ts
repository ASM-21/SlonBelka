// Offline queue for review answers, persisted in IndexedDB. When the network is
// unavailable, answers are stored here and later drained into POST /reviews/sync
// (which grades and applies SRS server-side, idempotently on client_event_id).

const DB_NAME = "slonbelka";
const STORE = "reviewQueue";
const VERSION = 1;

export interface QueuedReview {
  item_id: number;
  question_type: string;
  answer: string;
  client_event_id: string;
  answered_at: string; // ISO
  override: boolean;
}

const hasIDB = typeof indexedDB !== "undefined";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_event_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function enqueue(ev: QueuedReview): Promise<void> {
  if (!hasIDB) return;
  await tx("readwrite", (s) => s.put(ev));
}

export async function allQueued(): Promise<QueuedReview[]> {
  if (!hasIDB) return [];
  return (await tx<QueuedReview[]>("readonly", (s) => s.getAll())) ?? [];
}

export async function removeQueued(ids: string[]): Promise<void> {
  if (!hasIDB || ids.length === 0) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function queueCount(): Promise<number> {
  if (!hasIDB) return 0;
  return (await tx<number>("readonly", (s) => s.count())) ?? 0;
}
