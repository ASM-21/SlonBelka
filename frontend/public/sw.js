// Slonbelka service worker (hand-rolled, no build step).
// - App shell: cache "/" so the app loads offline after first visit.
// - Same-origin GETs: stale-while-revalidate (fast, self-healing as assets change).
// - Navigations: network-first, falling back to the cached shell when offline.
// API calls (cross-origin) are never cached; offline review answers are handled
// by the app's IndexedDB queue, not here.

const CACHE = "slonbelka-v3"; // bumped so stale shells refresh
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch API/cross-origin

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Show a reminder when the server sends a push. The payload may carry a
// due-review count, mirrored onto the app icon badge where supported.
self.addEventListener("push", (event) => {
  let data = { title: "Slonbelka", body: "You have reviews waiting." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    /* keep defaults */
  }
  const work = [
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  ];
  if (typeof data.count === "number" && self.navigator.setAppBadge) {
    work.push(self.navigator.setAppBadge(data.count).catch(() => {}));
  }
  event.waitUntil(Promise.all(work));
});

// Clicking the reminder lands directly on the review session: focus an open
// tab if there is one (telling it to navigate), otherwise open a fresh one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => "focus" in c);
      if (open) {
        open.postMessage({ type: "goto", view: "reviews" });
        return open.focus();
      }
      return self.clients.openWindow("/?goto=reviews");
    }),
  );
});
