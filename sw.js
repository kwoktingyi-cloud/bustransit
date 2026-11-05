let swTrackTimer = null;
let swTrackData = null;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("message", e => {
  if (!e.data) return;

  if (e.data.type === "START_SW_TRACK") {
    swTrackData = e.data.payload;
    if (swTrackTimer) clearInterval(swTrackTimer);

    // 用 waitUntil 保持 Service Worker 喺背景活躍
    e.waitUntil(
      new Promise(resolve => {
        swTrackTimer = setInterval(async () => {
          if (!swTrackData) {
            clearInterval(swTrackTimer);
            resolve();
            return;
          }
          const diffMin = Math.round((swTrackData.etaTimestamp - Date.now()) / 60000);
          if (diffMin < 0) {
            clearInterval(swTrackTimer);
            swTrackData = null;
            const list = await self.registration.getNotifications({ tag: "bus-eta-tracker" });
            list.forEach(n => n.close());
            resolve();
            return;
          }
          // 如果主頁面因為鎖屏無更新，由 Service Worker 自動補發更新
          if (Date.now() - (swTrackData.lastMainUpdate || 0) > 65000) {
            const etaLine = diffMin <= 0
              ? `即將到達 (${swTrackData.hhmmStr})`
              : `${diffMin} 分鐘 (${swTrackData.hhmmStr})`;
            const bodyLines = [swTrackData.stopName, etaLine];
            if (swTrackData.walkText) bodyLines.push(swTrackData.walkText);

            await self.registration.showNotification(swTrackData.titleText, {
              body: bodyLines.join("\n"),
              tag: "bus-eta-tracker",
              renotify: true,
              requireInteraction: true
            });
          }
        }, 60000);
      })
    );
  } else if (e.data.type === "STOP_SW_TRACK") {
    swTrackData = null;
    if (swTrackTimer) {
      clearInterval(swTrackTimer);
      swTrackTimer = null;
    }
  }
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
});
