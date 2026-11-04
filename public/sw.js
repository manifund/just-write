// Service worker: shows chat notifications sent by convex/pushAction.ts and opens the
// app when one is clicked. It doesn't cache anything; the portal needs the network anyway.
// Registered from lib/push.ts when someone turns notifications on.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  // Every push must show a notification (browsers penalize silent ones), so a
  // payload that isn't JSON still gets shown as text.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data.text() };
  }
  const shown = self.registration.showNotification(data.title || "Just Write", {
    body: data.body,
    tag: data.tag,
    renotify: !!data.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: data.url || "/home" },
  });
  // Unread channels on the app icon, where supported.
  const nav = self.navigator;
  const badge =
    typeof data.badge === "number" && nav.setAppBadge
      ? (data.badge > 0
          ? nav.setAppBadge(data.badge)
          : nav.clearAppBadge()
        ).catch(() => {})
      : null;
  event.waitUntil(Promise.all([shown, badge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/home", self.location)
    .href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const win = windows.find((w) => w.focused) || windows[0];
      if (win) {
        // The page navigates itself (app/providers.tsx), which is faster than a reload.
        win.postMessage({ type: "navigate", url });
        await win.focus().catch(() => {});
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

// Some browsers (Firefox) replace a subscription on their own. Subscribe again with the
// same key; the portal saves the new one to the server next time it opens.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (options)
    event.waitUntil(self.registration.pushManager.subscribe(options));
});
