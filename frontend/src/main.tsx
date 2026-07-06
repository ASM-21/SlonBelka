import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted fonts: the service worker never caches cross-origin requests,
// so Google Fonts would break offline. Bundled files get cached like any asset.
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/baloo-2/800.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./index.css";
import { initSync } from "./lib/sync";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Drain any offline-queued reviews now and whenever connectivity returns.
initSync();

// Register the service worker for offline support (production build only; the
// dev server doesn't serve a stable SW).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is best-effort */
    });
  });
}
