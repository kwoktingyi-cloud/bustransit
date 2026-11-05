self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "stop") {
    e.waitUntil(
      self.clients.matchAll({ type: "window" }).then(clients => {
        clients.forEach(c => c.postMessage({ type: "STOP_BUS_TRACK" }));
      })
    );
  }
});
