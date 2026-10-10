// Keep authenticated pages and API responses out of caches. The offline page
// explains connectivity; it does not present stale campus alerts or routes.
const CACHE = "lpu-offline-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add("/offline.html")));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("lpu-offline-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.mode === "navigate" &&
    new URL(event.request.url).origin === self.location.origin
  ) {
    event.respondWith(
      fetch(event.request).catch(
        async () =>
          (await caches.match("/offline.html")) ||
          new Response("You are offline. Please reconnect.", { status: 503 }),
      ),
    );
  }
});
function notificationUrl(value) {
  return typeof value === "string" &&
    /^\/\?view=conversations&room=[1-9][0-9]*$/.test(value)
    ? value
    : "/?view=announcements";
}
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    /* Still display a visible notification. */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Campus update", {
      body: data.body || "Open Campus Navigator to see the latest updates.",
      icon: "/icons/app-192.png",
      badge: "/icons/badge.png",
      tag: data.tag || "campus-update",
      data: { url: notificationUrl(data.url) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL(
        notificationUrl(event.notification.data?.url),
        self.location.origin,
      ).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = windows.find(
        (w) => new URL(w.url).origin === self.location.origin,
      );
      if (client) {
        await client.navigate(url);
        await client.focus();
      } else await self.clients.openWindow(url);
    })(),
  );
});
