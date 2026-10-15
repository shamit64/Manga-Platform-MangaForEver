/* MangaForEver service worker: offline shell, installability and new-chapter push notifications. */
const CACHE = "mf-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png", "/icon-512.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Network first for pages; when offline, show the offline page instead of the browser error.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MangaForEver", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "MangaForEver", {
      body: data.body || "A series you follow has a new chapter.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
