"use client";

// Switching channels and opening threads change the URL without asking Next.js's router.
//
// Next.js turns any history.pushState/replaceState into a router "restore", the same
// action it uses for Back/Forward. A restore renders only from the router's cache and
// never fetches. If the cached entry for the chat page has no data (for example, a
// response that was cut off after the device slept), the restore waits on it forever,
// and so does every later channel switch or thread open, since they all reuse the same
// entry. Normal links fetch fresh data, so they kept working. That is the "links stop
// working after a while" bug, which only affected channels and threads.
//
// So here the URL is written with the browser's own History methods (Next.js only
// patches the instance's methods, not History.prototype), and the chat reads the URL
// from this store instead of usePathname/useSearchParams. Next.js still owns real
// navigations and Back/Forward; on popstate this store follows the browser right away
// and Next.js's own state catches up when it can.

import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useSyncExternalStore, type MouseEvent } from "react";

// A URL we wrote, valid while the router still shows the URL it was written over
// (`base`). Once the router moves on (a real navigation), the router's URL wins again.
type Override = { url: string; base: string };
let override: Override | null = null;
let routerUrl = "";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const here = () => window.location.pathname + window.location.search;

// Back/Forward between chat URLs shows the new one right away. Anything else is left to
// the router, so the chat page never renders a non-chat URL.
function onPopState() {
  const url = here();
  override =
    url.startsWith("/chat/") && routerUrl.startsWith("/chat/")
      ? { url, base: routerUrl }
      : null;
  emit();
}

function subscribe(fn: () => void) {
  if (listeners.size === 0) window.addEventListener("popstate", onPopState);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0)
      window.removeEventListener("popstate", onPopState);
  };
}

function write(
  method: "pushState" | "replaceState",
  url: string,
  extra?: Record<string, unknown>,
) {
  // Keep Next.js's own keys on the entry so Back/Forward to it still goes through the
  // router (an entry with a state but without them makes Next.js reload the page).
  const current = window.history.state as Record<string, unknown> | null;
  const state = current?.__NA
    ? {
        __NA: current.__NA,
        __PRIVATE_NEXTJS_INTERNALS_TREE:
          current.__PRIVATE_NEXTJS_INTERNALS_TREE,
        ...extra,
      }
    : null;
  History.prototype[method].call(window.history, state, "", url);
  override = { url: here(), base: routerUrl };
  emit();
}

export const pushChatUrl = (url: string, extra?: Record<string, unknown>) =>
  write("pushState", url, extra);
export const replaceChatUrl = (url: string, extra?: Record<string, unknown>) =>
  write("replaceState", url, extra);

// The current path and query, including changes made with pushChatUrl/replaceChatUrl.
export function useChatUrl(): { pathname: string; search: URLSearchParams } {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const fromRouter = query ? `${pathname}?${query}` : pathname;
  const current = useSyncExternalStore(
    subscribe,
    () => override,
    () => null,
  );
  useLayoutEffect(() => {
    routerUrl = fromRouter;
    // The router moved on, so drop the old override (otherwise a later navigation back
    // to its base URL would bring it back).
    if (override && override.base !== fromRouter) override = null;
  }, [fromRouter]);
  const url = current && current.base === fromRouter ? current.url : fromRouter;
  const u = new URL(url, "http://x");
  return { pathname: u.pathname, search: u.searchParams };
}

// For links between chat pages (the sidebar, links in messages): switch in place
// rather than navigating. Cmd/Ctrl/Shift/Alt-clicks and middle clicks still go to the
// link as usual, and links from other pages navigate normally.
export function chatLinkClick(e: MouseEvent<HTMLAnchorElement>, to: string) {
  if (
    !here().startsWith("/chat/") ||
    !to.startsWith("/chat/") ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  )
    return;
  e.preventDefault();
  if (to !== here()) pushChatUrl(to);
}
