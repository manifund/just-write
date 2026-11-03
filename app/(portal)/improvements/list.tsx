"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/portal/avatar";
import { ImprovementCard } from "@/components/portal/improvement";
import { timeAgo, useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

type Row = (typeof api.improvements.list._returnType)[number];
type Status = Row["status"];

const STATUS: Record<Status, string> = {
  queued: "Starting",
  running: "Working",
  answered: "Answered",
  pr: "Needs review",
  merged: "Merged",
  closed: "Closed",
  failed: "Failed",
  superseded: "Updated later",
};

// Status tabs. The first one is the default.
const TABS = [
  { key: "review", label: "Needs review", statuses: ["pr"] },
  { key: "working", label: "In progress", statuses: ["queued", "running"] },
  { key: "merged", label: "Merged", statuses: ["merged"] },
  { key: "closed", label: "Closed", statuses: ["closed", "failed", "superseded"] },
  { key: "answered", label: "Questions", statuses: ["answered"] },
  { key: "all", label: "All", statuses: null },
] as const satisfies readonly {
  key: string;
  label: string;
  statuses: readonly Status[] | null;
}[];
type TabKey = (typeof TABS)[number]["key"];

const inTab = (tab: (typeof TABS)[number], r: Row) =>
  tab.statuses === null || (tab.statuses as readonly Status[]).includes(r.status);

const urlListeners = new Set<() => void>();
const notifyUrl = () => urlListeners.forEach((l) => l());
function subscribeUrl(l: () => void) {
  urlListeners.add(l);
  window.addEventListener("popstate", l);
  return () => {
    urlListeners.delete(l);
    window.removeEventListener("popstate", l);
  };
}

// Server-rendered first, then live.
export function ImprovementList({ initial }: { initial: Row[] }) {
  const rows = useQuery(api.improvements.list) ?? initial;
  const viewer = useQuery(api.members.viewer);
  const now = useNow();
  const signedInMember = !!viewer?.canEnter;
  const isAdmin = !!viewer?.isAdmin;

  const [who, setWho] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // The status tab lives in the URL (?status=merged) so a filtered view can be shared.
  // Read in the browser only, so the server-rendered list stays cacheable.
  const tabKey = useSyncExternalStore(
    subscribeUrl,
    () => new URLSearchParams(window.location.search).get("status"),
    () => null,
  );
  const pickTab = (key: TabKey) => {
    const url = new URL(window.location.href);
    if (key === TABS[0].key) url.searchParams.delete("status");
    else url.searchParams.set("status", key);
    window.history.replaceState(window.history.state, "", url);
    notifyUrl();
  };

  const requesters = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows)
      if (r.requester) m.set(r.requester._id, r.requester.name ?? "Someone");
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // Who and search narrow every tab; the tab counts reflect them.
  const q = search.trim().toLowerCase();
  const narrowed = rows.filter(
    (r) =>
      (!who || r.requester?._id === who) &&
      (!q ||
        `#${r.number} ${r.title ?? ""} ${r.request} ${r.summary ?? ""}`
          .toLowerCase()
          .includes(q)),
  );
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const shown = narrowed.filter((r) => inTab(tab, r));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="mx-auto flex max-w-[56rem] flex-col gap-[clamp(20px,3vh,32px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-2">
        <p className="text-[13px] tracking-[0.14em] text-brass-text uppercase">
          {rows.length} requests ·{" "}
          {rows.filter((r) => r.status === "merged").length} merged
        </p>
        <p className="max-w-[36rem] text-[17px] text-pretty text-ink-muted">
          Members can mention @Claude in chat to ask for a change to this site.
          Claude writes the code, and small changes go live after review.
        </p>
      </header>

      <div className="flex flex-col border border-ink/15">
        <div className="flex flex-col gap-3 border-b border-ink/15 bg-cream-deep/60 px-4 py-3">
          <div
            role="group"
            aria-label="Status"
            className="flex flex-wrap gap-x-1 gap-y-1"
          >
            {TABS.map((t) => {
              const count = narrowed.filter((r) => inTab(t, r)).length;
              const active = t.key === tab.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickTab(t.key)}
                  className={`cursor-pointer px-2.5 py-1 text-[14px] transition-colors ${
                    active
                      ? "bg-ink text-cream"
                      : "text-ink-muted hover:bg-ink/8 hover:text-ink"
                  }`}
                >
                  {t.label}{" "}
                  <span
                    className={`tabular-nums ${active ? "text-cream/75" : "text-ink-muted/80"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests"
              aria-label="Search requests"
              className="min-w-0 flex-1 basis-[14rem] border border-ink/20 bg-cream px-2.5 py-1 text-[14px] placeholder:text-ink-muted/70 focus:border-ink/50 focus:outline-none"
            />
            <select
              value={who}
              onChange={(e) => setWho(e.target.value)}
              aria-label="Requested by"
              className="border border-ink/20 bg-cream px-2 py-1 text-[14px] focus:border-ink/50 focus:outline-none"
            >
              <option value="">Anyone</option>
              {requesters.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-[15px] text-ink-muted">
            {rows.length === 0
              ? "Nothing yet."
              : tab.key === "review" && !who && !q
                ? "Nothing is waiting for review."
                : "No requests match."}
          </p>
        ) : (
          <ol className="flex flex-col">
            {shown.map((r) => {
              const expanded = open.has(r._id);
              const heading =
                r.status !== "answered" && r.title
                  ? r.title
                  : r.request.length > 140
                    ? `${r.request.slice(0, 140)}…`
                    : r.request;
              return (
                <li
                  key={r._id}
                  className="border-t border-ink/12 first:border-t-0"
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <StatusMark status={r.status} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggle(r._id)}
                        className="cursor-pointer text-left text-[16px] leading-[1.3] font-[700] break-words hover:text-brass-text"
                      >
                        {heading}
                      </button>
                      <p className="text-[13px] text-ink-muted">
                        #{r.number} · {STATUS[r.status]}
                        {r.status === "pr" && !r.checksPassed && " · checks failed"}{" "}
                        · {r.requester?.name ?? "Someone"}
                        {now ? ` asked ${timeAgo(r.createdAt, now)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[13px]">
                      {r.prUrl && (
                        <a
                          href={r.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden sm:inline"
                        >
                          PR #{r.prNumber}
                        </a>
                      )}
                      <Avatar member={r.requester} size={24} />
                    </div>
                  </div>
                  {expanded && (
                    <div className="flex flex-col gap-3 px-4 pb-4 pl-[2.75rem]">
                      <blockquote className="border-l-3 border-wash pl-3 text-[15px] text-ink-muted">
                        {r.request.length > 400
                          ? `${r.request.slice(0, 400)}…`
                          : r.request}
                      </blockquote>
                      <ImprovementCard card={r} isAdmin={isAdmin} />
                      {signedInMember && (
                        <Link href={r.threadHref} className="w-fit text-[14px]">
                          Open thread
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}

// A small status icon, like an issue tracker's open/merged/closed mark.
function StatusMark({ status }: { status: Status }) {
  const base = "mt-[5px] inline-block size-3 shrink-0 rounded-full";
  const cls =
    status === "pr"
      ? "border-2 border-brass"
      : status === "queued" || status === "running"
        ? "bg-brass motion-safe:animate-pulse"
        : status === "merged"
          ? "bg-ink"
          : status === "failed"
            ? "bg-brass-text"
            : status === "answered"
              ? "border-2 border-wash"
              : "bg-wash";
  return (
    <span aria-hidden="true" title={STATUS[status]} className={`${base} ${cls}`} />
  );
}
