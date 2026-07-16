// Provides a fake IndexedDB so the offline queue can be tested in Node/jsdom.
import "fake-indexeddb/auto";

// Let React's act() know it is running under a test harness (required for
// component tests rendered through react-dom/client).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ReviewSession generates client event ids with crypto.randomUUID; make sure
// it exists whatever jsdom version is running.
const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
if (cryptoObj && typeof cryptoObj.randomUUID !== "function") {
  cryptoObj.randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}
