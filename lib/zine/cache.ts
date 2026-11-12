// Finished /zine previews, kept in this browser so reopening the page with the same issue
// and settings shows the pages without typesetting again. Keyed by a hash of the document
// Paged.js was given, so any change to the essays, settings, or layout code misses.
// Kept in memory for client-side navigation and in IndexedDB across reloads.

export type Render = { snapshot: string; pages: number };

const DB = "zine";
const STORE = "renders";
const KEEP = 6;

const memory = new Map<string, Render>();

export async function renderKey(html: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let opening: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE).createIndex("at", "at");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return opening;
}

function done<T>(req: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function remember(key: string, render: Render) {
  memory.delete(key);
  memory.set(key, render);
  for (const old of memory.keys()) {
    if (memory.size <= KEEP) break;
    memory.delete(old);
  }
}

export async function getRender(key: string): Promise<Render | null> {
  const hit = memory.get(key);
  if (hit) return hit;
  try {
    const db = await open();
    if (!db) return null;
    const row = (await done(
      db.transaction(STORE).objectStore(STORE).get(key),
    )) as (Render & { at: number }) | null | undefined;
    if (!row) return null;
    const render = { snapshot: row.snapshot, pages: row.pages };
    remember(key, render);
    return render;
  } catch {
    return null;
  }
}

export async function putRender(key: string, render: Render) {
  remember(key, render);
  try {
    const db = await open();
    if (!db) return;
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await done(store.put({ ...render, at: Date.now() }, key));
    // Oldest first; keep the newest few.
    const keys = (await done(store.index("at").getAllKeys())) ?? [];
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP)))
      store.delete(old);
  } catch {}
}

// Typesetting that was still going when /zine was closed (client-side navigation) is
// finished in a hidden iframe, so the pages are saved and the next visit opens them at once.
// The page waits on a running job for its document instead of starting a second one.
type Job = {
  done: Promise<Render | null>;
  progress: number;
  listeners: Set<(pages: number) => void>;
  stop: () => void;
};
const jobs = new Map<string, Job>();
const JOB_LIMIT_MS = 10 * 60_000;

export function backgroundJob(key: string): Job | undefined {
  return jobs.get(key);
}

export function finishInBackground(key: string, html: string) {
  if (typeof document === "undefined" || jobs.has(key) || memory.has(key)) return;
  // Only the newest one: an older job is for settings nobody is looking at anymore.
  for (const job of jobs.values()) job.stop();
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // In the viewport but transparent, so the browser doesn't throttle it as offscreen.
  frame.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:-1";
  let finish: (r: Render | null) => void = () => {};
  const job: Job = {
    done: new Promise((resolve) => (finish = resolve)),
    progress: 0,
    listeners: new Set(),
    stop: () => stop(null),
  };
  const stop = (render: Render | null) => {
    window.removeEventListener("message", onMessage);
    clearTimeout(timer);
    frame.remove();
    if (jobs.get(key) === job) jobs.delete(key);
    finish(render);
  };
  const onMessage = (ev: MessageEvent) => {
    if (ev.source !== frame.contentWindow) return;
    const d = ev.data as { type?: string; pages?: number; snapshot?: string };
    if (d.type === "zine:progress") {
      job.progress = d.pages ?? 0;
      for (const l of job.listeners) l(job.progress);
    }
    if (d.type === "zine:done") {
      const render =
        typeof d.snapshot === "string" && d.pages
          ? { snapshot: d.snapshot, pages: d.pages }
          : null;
      if (render) void putRender(key, render);
      stop(render);
    }
  };
  const timer = setTimeout(() => stop(null), JOB_LIMIT_MS);
  window.addEventListener("message", onMessage);
  jobs.set(key, job);
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
