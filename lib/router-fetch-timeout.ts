// Puts a time limit on the requests Next.js's client router makes for pages
// (navigations and prefetches, marked with an `RSC: 1` header).
//
// The router has no timeout of its own. A request that never finishes leaves its
// part of the page waiting forever, and the router keeps reusing that same unfinished
// entry: later clicks to that page wait on it too, and switching channels (a history
// update that only reads what's cached) waits on it as well. On screen, links just
// stop doing anything. This happens most after a phone or laptop has slept or
// changed networks, when the browser can keep sending requests down a connection
// that has died.
//
// When the limit is hit, the request fails with a TimeoutError. Next.js treats that
// like any failed request: a navigation falls back to a normal page load, and a
// prefetch is dropped and fetched again when needed.

// No response at all after this long means the connection is dead.
const RESPONSE_MS = 10_000;
// Page responses stream in, but ours finish in a few seconds. Cancelling a request
// that has already finished does nothing, so this timer doesn't need clearing.
const TOTAL_MS = 30_000;

export function installRouterFetchTimeout() {
  if (typeof window === "undefined") return;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (!init?.headers || new Headers(init.headers).get("rsc") !== "1")
      return original(input, init);

    const controller = new AbortController();
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else
        outer.addEventListener("abort", () => controller.abort(outer.reason), {
          once: true,
        });
    }
    const timeout = () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    const noResponse = setTimeout(timeout, RESPONSE_MS);
    setTimeout(timeout, TOTAL_MS);

    return original(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(noResponse),
    );
  };
}
