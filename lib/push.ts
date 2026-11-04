// Browser side of push notifications. public/sw.js shows them; convex/push.ts stores
// subscriptions and decides who gets what.

type PushSupport = "supported" | "install-first" | "unsupported";

// iPhones and iPads only allow push in an app added to the Home Screen.
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
    return "supported";
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? "install-first" : "unsupported";
}

type SubscriptionArgs = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function toArgs(sub: PushSubscription): SubscriptionArgs {
  const { endpoint, keys } = sub.toJSON();
  return { endpoint: endpoint!, p256dh: keys!.p256dh, auth: keys!.auth };
}

async function registration() {
  if (!("serviceWorker" in navigator)) return undefined;
  return await navigator.serviceWorker.getRegistration("/");
}

async function currentSubscription() {
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}

export async function deviceSubscription() {
  const sub = await currentSubscription();
  return sub ? toArgs(sub) : null;
}

// Asks for permission and subscribes this browser. Call it straight from a click:
// Safari only shows the permission prompt in response to one.
export async function subscribeDevice(publicKey: string) {
  if ((await Notification.requestPermission()) !== "granted") return null;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  return toArgs(sub);
}

// Unsubscribes this browser and returns the endpoint that was removed.
export async function unsubscribeDevice() {
  const sub = await currentSubscription();
  if (!sub) return null;
  await sub.unsubscribe();
  return sub.endpoint;
}

// Clears notifications for a channel once it's been read here.
export async function closeNotifications(tag: string) {
  const reg = await registration();
  for (const n of (await reg?.getNotifications({ tag })) ?? []) n.close();
}

// The number on the installed app's icon. Browsers without badges ignore it.
export function setAppBadge(count: number) {
  if (!("setAppBadge" in navigator)) return;
  const done =
    count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
  done.catch(() => {});
}

function base64UrlToBytes(s: string) {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
