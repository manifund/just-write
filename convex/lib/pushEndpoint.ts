// The push services browsers subscribe through. Subscriptions are only saved for, and
// sent to, these hosts, so a member can't make the server send requests to any URL.
const HOSTS = ["fcm.googleapis.com"]; // Chrome and other Chromium browsers
const SUFFIXES = [
  ".push.services.mozilla.com", // Firefox
  ".push.apple.com", // Safari
  ".notify.windows.com", // Edge
];

// The endpoint in normal form if it's on a known push service, else null. Save and send
// the returned value, not the raw string: web-push parses URLs with Node's older parser,
// and a plain host in a re-serialized URL reads the same to both.
export function pushEndpoint(raw: string) {
  if (raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname.replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!HOSTS.includes(host) && !SUFFIXES.some((s) => host.endsWith(s)))
    return null;
  return `https://${host}${url.pathname}${url.search}`;
}
