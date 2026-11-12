"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backgroundJob,
  finishInBackground,
  getPrebuilt,
  getRender,
  putRender,
  renderKey,
} from "@/lib/zine/cache";
import {
  cachedDocument,
  cleanTitle,
  issueEssays,
  orderEssays,
  zineDocument,
} from "@/lib/zine/document";
import {
  BODY_FONTS,
  DEFAULT_TWEAKS,
  HOUSE_TWEAKS,
  DISPLAY_FONTS,
  PALETTES,
  PRESETS,
  TRIMS,
  readTweaks,
  spineInches,
  type Tweaks,
} from "@/lib/zine/tweaks";
import type { ZineArt, ZineDefaults, ZineIssue } from "@/lib/zine/types";

const STORAGE = "zine:tweaks";

type Doc = { key: number; html: string; saved: boolean };

// /zine: the magazine laid out by Paged.js in an iframe, with design controls beside it.
// Each change typesets the issue again in a hidden iframe and swaps it in when done, so
// the old pages stay up while the new ones are set. The iframe isn't sandboxed: Paged.js
// stalls in an opaque origin, and the essays' HTML is rebuilt from a tag whitelist with no
// scripts or attributes beyond href/src/alt (scripts/zine-cache.ts). Finished pages are
// saved in the browser (lib/zine/cache.ts), so the same issue and settings open at once;
// leaving mid-typeset finishes it in the background so the next visit is instant too.
// The default design's pages also ship with the site (scripts/zine-pages.ts), so a first
// visit on the defaults opens at once.
export function Zine({
  issues,
  art,
  defaults,
}: {
  issues: ZineIssue[];
  art: ZineArt;
  defaults: ZineDefaults;
}) {
  const [week, setWeek] = useState(issues[0]?.week ?? 1);
  const issue = issues.find((i) => i.week === week);
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [spreads, setSpreads] = useState(true);
  const [guides, setGuides] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [pages, setPages] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const scroll = useRef(0);
  const nextKey = useRef(1);
  // Cache key of each frame that's typesetting, so its finished pages can be saved.
  const cacheKeys = useRef(new Map<number, string>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (saved) setTweaks(readTweaks(JSON.parse(saved)));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(tweaks));
    } catch {}
  }, [tweaks, loaded]);

  const set = useCallback(
    <K extends keyof Tweaks>(k: K, v: Tweaks[K]) =>
      setTweaks((t) => ({ ...t, [k]: v })),
    [],
  );

  // The view, read when a saved copy is opened so it starts at the current zoom.
  const view = useRef({ zoom, spreads, guides });
  useEffect(() => {
    view.current = { zoom, spreads, guides };
  }, [zoom, spreads, guides]);

  // Typeset again shortly after the last change.
  useEffect(() => {
    if (!loaded || !issue) return;
    let cancelled = false;
    let unlisten = () => {};
    const timer = setTimeout(
      async () => {
        const html = zineDocument(issue, art, tweaks, { preview: true });
        const cacheKey = await renderKey(html).catch(() => null);
        let hit = cacheKey ? await getRender(cacheKey) : null;
        // The default pages shipped with the site, if they came from this same document.
        const prebuilt = defaults[issue.week];
        if (cacheKey && !hit && prebuilt?.key === cacheKey)
          hit = await getPrebuilt(cacheKey, prebuilt);
        // Typesetting left running from an earlier visit: wait for it instead.
        const job = cacheKey && !hit ? backgroundJob(cacheKey) : undefined;
        if (job && !cancelled) {
          setProgress(job.progress);
          job.listeners.add(setProgress);
          unlisten = () => job.listeners.delete(setProgress);
          hit = await job.done;
          unlisten();
        }
        if (cancelled) return;
        const key = nextKey.current++;
        if (cacheKey && !hit) cacheKeys.current.set(key, cacheKey);
        setProgress(0);
        setDocs((ds) => [
          ...ds.filter((d) => d.key === shown),
          hit
            ? { key, html: cachedDocument(hit.snapshot, hit.pages, view.current), saved: true }
            : { key, html, saved: false },
        ]);
      },
      shown === null ? 0 : 450,
    );
    return () => {
      cancelled = true;
      unlisten();
      clearTimeout(timer);
    };
    // `shown` is read only to keep the visible frame; it shouldn't trigger a new render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweaks, issue, art, defaults, loaded]);

  // Leaving while the newest version is still typesetting: finish it in the background.
  const pending = useRef<{ key: string; html: string } | null>(null);
  useEffect(() => {
    const last = docs.at(-1);
    const cacheKey = last && last.key !== shown ? cacheKeys.current.get(last.key) : undefined;
    pending.current = last && cacheKey ? { key: cacheKey, html: last.html } : null;
  }, [docs, shown]);
  useEffect(
    () => () => {
      if (pending.current) finishInBackground(pending.current.key, pending.current.html);
    },
    [],
  );

  const latest = docs.at(-1)?.key ?? null;
  const busy = latest !== null && latest !== shown;

  const sendView = useCallback(
    (frame: HTMLIFrameElement | undefined) =>
      frame?.contentWindow?.postMessage(
        { type: "zine:view", zoom, spreads, guides },
        "*",
      ),
    [zoom, spreads, guides],
  );

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const entry = [...frames.current].find(
        ([, f]) => f.contentWindow === ev.source,
      );
      if (!entry) return;
      const [key, frame] = entry;
      const d = ev.data as {
        type?: string;
        pages?: number;
        f?: number;
        snapshot?: string;
      };
      if (d.type === "zine:progress" && key === latest) setProgress(d.pages ?? 0);
      if (d.type === "zine:scroll" && key === shown) scroll.current = d.f ?? 0;
      if (d.type === "zine:done") {
        const cacheKey = cacheKeys.current.get(key);
        cacheKeys.current.delete(key);
        if (cacheKey && typeof d.snapshot === "string" && d.pages)
          void putRender(cacheKey, { snapshot: d.snapshot, pages: d.pages });
      }
      if (d.type === "zine:done" && key === latest) {
        sendView(frame);
        frame.contentWindow?.postMessage(
          { type: "zine:scrollTo", f: scroll.current },
          "*",
        );
        setPages(d.pages ?? null);
        setShown(key);
        setDocs((ds) => ds.filter((x) => x.key === key));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [latest, shown, sendView]);

  useEffect(() => {
    if (shown !== null) sendView(frames.current.get(shown));
  }, [shown, sendView]);

  const essays = useMemo(
    () => (issue ? issueEssays(issue, tweaks) : []),
    [issue, tweaks],
  );
  const words = essays.reduce((n, e) => n + e.words, 0);

  const pdfCommand = useMemo(() => {
    const diff = Object.fromEntries(
      Object.entries(tweaks).filter(
        ([k, v]) =>
          JSON.stringify(v) !== JSON.stringify(DEFAULT_TWEAKS[k as keyof Tweaks]),
      ),
    );
    return `bun scripts/zine-pdf.ts --week ${week} --tweaks '${JSON.stringify(diff).replace(/'/g, "'\\''")}'`;
  }, [tweaks, week]);

  if (!issue)
    return (
      <main className="px-[clamp(20px,4vw,56px)] py-10">
        <h1 className="font-display text-[40px] font-[340]">Zine</h1>
        <p className="mt-3 text-ink-muted">
          No issues cached yet. Run <code>bun scripts/zine-cache.ts --week 1</code>.
        </p>
      </main>
    );

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-[70vh] min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink/10 px-4 py-2.5 text-[14px]">
          <h1 className="font-display text-[22px] leading-none font-[400]">
            Zine
          </h1>
          {issues.length > 1 ? (
            <select
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="border border-ink/20 bg-paper px-2 py-1"
            >
              {issues.map((i) => (
                <option key={i.week} value={i.week}>
                  Issue {i.week}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-ink-muted">Issue {week}</span>
          )}
          <span className="text-ink-muted tabular-nums">
            {busy && docs.at(-1)?.saved
              ? "Opening…"
              : busy
              ? `Typesetting… ${progress} pages`
              : pages !== null
                ? `${pages} pages · ${essays.length} essays · ${words.toLocaleString("en-US")} words · spine ≈ ${spineInches(pages).toFixed(2)} in`
                : "Typesetting…"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ToolButton onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} label="Zoom out">
              −
            </ToolButton>
            <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <ToolButton onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} label="Zoom in">
              +
            </ToolButton>
            <ToolButton active={spreads} onClick={() => setSpreads((s) => !s)} label="Show facing pages">
              Spreads
            </ToolButton>
            <ToolButton active={guides} onClick={() => setGuides((g) => !g)} label="Show text area and bleed">
              Guides
            </ToolButton>
            <ToolButton
              onClick={() =>
                shown !== null &&
                frames.current.get(shown)?.contentWindow?.postMessage({ type: "zine:print" }, "*")
              }
              label="Print or save as PDF from the browser"
            >
              Print
            </ToolButton>
            <ToolButton
              onClick={() => {
                navigator.clipboard.writeText(pdfCommand).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              label={pdfCommand}
            >
              {copied ? "Copied" : "Copy PDF command"}
            </ToolButton>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#e6e2dc]">
          {docs.map((d) => (
            <iframe
              key={d.key}
              ref={(el) => {
                if (el) frames.current.set(d.key, el);
                else frames.current.delete(d.key);
              }}
              title={`Issue ${week} preview`}
              srcDoc={d.html}
              className={`absolute inset-0 h-full w-full border-0 ${
                d.key === shown ? "" : "pointer-events-none invisible"
              }`}
            />
          ))}
          {shown === null && (
            <p className="absolute inset-0 flex items-center justify-center text-ink-muted">
              {docs.at(-1)?.saved
                ? "Opening…"
                : `Typesetting… ${progress > 0 ? `${progress} pages` : ""}`}
            </p>
          )}
        </div>
      </section>
      <Panel
        tweaks={tweaks}
        set={set}
        setTweaks={setTweaks}
        issue={issue}
        essays={essays}
      />
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`cursor-pointer border px-2 py-1 leading-none ${
        active
          ? "border-ink bg-ink text-cream"
          : "border-ink/20 hover:bg-cream-hover"
      }`}
    >
      {children}
    </button>
  );
}

type Setter = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;

function Panel({
  tweaks: t,
  set,
  setTweaks,
  issue,
  essays,
}: {
  tweaks: Tweaks;
  set: Setter;
  setTweaks: (t: Tweaks) => void;
  issue: ZineIssue;
  essays: ZineIssue["essays"];
}) {
  const failed = issue.essays.filter((e) => e.error);
  // Listed in the Order setting's order, so "first 10" reads top to bottom.
  const readable = orderEssays(
    issue.essays.filter((e) => !e.error),
    t,
  );
  const included = new Set(essays.map((e) => e.id));
  // Picking by hand turns the current selection into an explicit list.
  const choose = (ids: Set<string>) =>
    setTweaks({
      ...t,
      limit: null,
      exclude: readable.filter((e) => !ids.has(e.id)).map((e) => e.id),
    });
  return (
    <aside className="flex max-h-none shrink-0 flex-col gap-6 overflow-y-auto border-t border-ink/10 bg-paper px-5 py-5 text-[14px] lg:max-h-full lg:w-[320px] lg:border-t-0 lg:border-l">
      <Group title="Presets">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() =>
                setTweaks({
                  ...HOUSE_TWEAKS,
                  ...p.tweaks,
                  exclude: t.exclude,
                  limit: t.limit,
                })
              }
              className="cursor-pointer border border-ink/20 px-2.5 py-1 hover:bg-cream-hover"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Page">
        <Select
          label="Trim"
          value={t.trim}
          options={Object.entries(TRIMS).map(([k, v]) => [k, v.label])}
          onChange={(v) => set("trim", v as Tweaks["trim"])}
        />
        <Slider label="Margins" value={t.margins} min={0.8} max={1.3} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("margins", v)} />
        <Segmented label="Columns" value={t.columns} options={[[1, "One"], [2, "Two"]]}
          onChange={(v) => set("columns", v)} />
        <Check label="Bleed (0.125 in)" checked={t.bleed} onChange={(v) => set("bleed", v)} />
      </Group>

      <Group title="Type">
        <Select
          label="Body"
          value={t.bodyFont}
          options={Object.entries(BODY_FONTS).map(([k, v]) => [k, v.name])}
          onChange={(v) => set("bodyFont", v as Tweaks["bodyFont"])}
        />
        <Select
          label="Titles"
          value={t.displayFont}
          options={Object.entries(DISPLAY_FONTS).map(([k, v]) => [
            k,
            "label" in v ? v.label : v.name,
          ])}
          onChange={(v) => set("displayFont", v as Tweaks["displayFont"])}
        />
        <Slider label="Size" value={t.size} min={8.5} max={13} step={0.25}
          format={(v) => `${v} pt`} onChange={(v) => set("size", v)} />
        <Slider label="Leading" value={t.leading} min={1.2} max={1.7} step={0.02}
          format={(v) => v.toFixed(2)} onChange={(v) => set("leading", v)} />
        <Slider label="Title size" value={t.titleScale} min={0.7} max={1.6} step={0.05}
          format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("titleScale", v)} />
        <Check label="Italic titles" checked={t.titleItalic} onChange={(v) => set("titleItalic", v)} />
      </Group>

      <Group title="Text">
        <Segmented label="Paragraphs" value={t.paragraphs}
          options={[["indent", "Indent"], ["spaced", "Spaced"]]} onChange={(v) => set("paragraphs", v)} />
        <Segmented label="Drop cap" value={t.dropCap}
          options={[[0, "None"], [2, "2 lines"], [3, "3 lines"]]} onChange={(v) => set("dropCap", v)} />
        <Segmented label="End mark" value={t.endMark}
          options={[["none", "None"], ["square", "■"], ["asterism", "⁂"], ["fleuron", "❦"]]}
          onChange={(v) => set("endMark", v)} />
        <Check label="Justify and hyphenate" checked={t.justify} onChange={(v) => set("justify", v)} />
      </Group>

      <Group title="Layout">
        <Segmented label="Opener" value={t.opener}
          options={[["classic", "Centered"], ["left", "Left"], ["titlePage", "Full page"]]}
          onChange={(v) => set("opener", v)} />
        <Segmented label="Page numbers" value={t.folio}
          options={[["outer", "Outside"], ["center", "Center"]]} onChange={(v) => set("folio", v)} />
        <Check label="Running heads" checked={t.runningHeads} onChange={(v) => set("runningHeads", v)} />
        <Check label="Start essays on a right-hand page" checked={t.startRight}
          onChange={(v) => set("startRight", v)} />
        <Check label="Cover" checked={t.cover} onChange={(v) => set("cover", v)} />
        <Check label="Contents" checked={t.contents} onChange={(v) => set("contents", v)} />
      </Group>

      <Group title="Color">
        <div className="flex flex-wrap gap-2">
          {Object.entries(PALETTES).map(([k, p]) => (
            <button
              key={k}
              type="button"
              title={p.label}
              aria-label={p.label}
              aria-pressed={t.palette === k}
              onClick={() => set("palette", k as Tweaks["palette"])}
              className={`flex cursor-pointer items-center gap-1.5 border px-2 py-1 ${
                t.palette === k ? "border-ink" : "border-ink/15"
              }`}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.cover }} />
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.accent }} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <Segmented label="Images" value={t.images}
          options={[["color", "Color"], ["gray", "Gray"], ["none", "Hide"]]} onChange={(v) => set("images", v)} />
      </Group>

      <Group title={`Essays · ${included.size} of ${readable.length}`}>
        <Segmented label="Order" value={t.order}
          options={[["submitted", "Submitted"], ["author", "Author"], ["length", "Length"]]}
          onChange={(v) => set("order", v)} />
        <Segmented label="Length" value={t.length}
          options={[["full", "Full"], [2, "2 pp"], [3, "3 pp"], [4, "4 pp"]]}
          onChange={(v) => set("length", v)} />
        {t.length !== "full" && (
          <p className="-mt-1 text-[12px] text-ink-muted">
            About {t.length} pages of each essay, then a link to the rest.
          </p>
        )}
        <Segmented label="QR codes" value={t.qr}
          options={[["all", "All"], ["overflow", "Overflow"], ["none", "None"]]}
          onChange={(v) => set("qr", v)} />
        <Segmented
          label="Include"
          value={
            t.exclude.length === 0 && t.limit === 10
              ? "10"
              : t.exclude.length === 0 && t.limit === null
                ? "all"
                : included.size === 0
                  ? "none"
                  : "custom"
          }
          options={[["10", "First 10"], ["all", "All"], ["none", "None"]]}
          onChange={(v) =>
            setTweaks({
              ...t,
              limit: v === "10" ? 10 : null,
              exclude: v === "none" ? readable.map((e) => e.id) : [],
            })
          }
        />
        <ul className="flex flex-col gap-1">
          {readable.map((e) => (
            <li key={e.id}>
              <label className="flex cursor-pointer items-baseline gap-2">
                <input
                  type="checkbox"
                  checked={included.has(e.id)}
                  onChange={(ev) => {
                    const ids = new Set(included);
                    if (ev.target.checked) ids.add(e.id);
                    else ids.delete(e.id);
                    choose(ids);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{cleanTitle(e)}</span>
                  <span className="text-[12px] text-ink-muted">
                    {e.author.name} · {e.words.toLocaleString("en-US")} words
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {failed.length > 0 && (
          <details className="text-[13px] text-ink-muted">
            <summary className="cursor-pointer">
              {failed.length} couldn’t be read
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {failed.map((e) => (
                <li key={e.id}>
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.title}
                  </a>{" "}
                  ({e.author.name}): {e.error}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Group>

      <button
        type="button"
        onClick={() =>
          setTweaks({ ...DEFAULT_TWEAKS, exclude: t.exclude, limit: t.limit })
        }
        className="cursor-pointer self-start text-[13px] text-ink-muted underline"
      >
        Reset design
      </button>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[11.5rem] border border-ink/20 bg-paper px-2 py-1"
      >
        {options.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-ink-muted tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--color-brass-numeral)]"
      />
    </label>
  );
}

function Segmented<V extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: [V, string][];
  onChange: (v: V) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <div className="flex" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`-ml-px cursor-pointer border px-2 py-0.5 first:ml-0 ${
              value === v
                ? "relative z-10 border-ink bg-ink text-cream"
                : "border-ink/20 hover:bg-cream-hover"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
