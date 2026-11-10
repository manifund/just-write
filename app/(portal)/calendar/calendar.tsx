"use client";

import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/convex/_generated/api";
import type { CalendarEvent } from "@/convex/events";
import {
  fmtLongDay,
  fmtTime,
  fmtTimeRange,
  ptDayKey,
  ptParts,
  ptToUtc,
} from "@/convex/lib/time";
import { Avatar } from "@/components/portal/avatar";
import { useNow } from "@/components/portal/util";
import { EventEditor } from "./editor";
import { EventPanel, PanelHeader } from "./event-panel";
import { Subscribe } from "./subscribe";

// Sessions are keyed by slug (or id, for old links).
export type Panel =
  | { kind: "event"; key: string }
  | { kind: "new"; day?: string }
  | { kind: "edit"; key: string }
  | { kind: "subscribe" };

// True on phone-sized screens, which start in list view. False while prerendering.
function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

// The program is one month: the grid always shows Sun Nov 1 through the first week of
// December (the wrap party is Dec 2). Sessions just outside stretch it by up to two weeks;
// anything further out is only in the list view.
const PROGRAM_FIRST = "2026-11-01";
const PROGRAM_END = "2026-12-05";
const GRID_MIN = "2026-10-18";
const GRID_MAX = "2026-12-19";

const shortMonth = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

// "Austin", "Austin and Sam", "Austin, Sam, and Lee", "Austin, Sam, and 2 others".
export function firstNames(people: { name: string }[]) {
  const n = people.map((p) => p.name.split(" ")[0]);
  if (n.length <= 2) return n.join(" and ");
  if (n.length === 3) return `${n[0]}, ${n[1]}, and ${n[2]}`;
  return `${n[0]}, ${n[1]}, and ${n.length - 2} others`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthName = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

// Server-rendered first (without addresses), then live.
// Lives in the calendar layout, so it stays mounted while the URL moves between
// /calendar and /calendar/<slug> (which the page routes only exist for, for metadata).
export function Calendar({ initial }: { initial: CalendarEvent[] }) {
  const events = useQuery(api.events.list) ?? initial;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.members.viewer, isAuthenticated ? {} : "skip");
  const isMember = !!viewer?.canEnter && !!viewer.member;

  // Null while prerendering; the page then shows November 2026 until the browser takes over.
  const now = useNow(60_000);
  const today = now ? ptDayKey(now) : "";
  const narrow = useNarrow();
  const [pickedView, setView] = useState<"month" | "list" | null>(null);
  const view = pickedView ?? (narrow ? "list" : "month");
  const [panel, setPanelState] = useState<Panel | null>(null);

  // An open session lives at /calendar/<slug>, so it can be linked from chat, email, and Google Calendar.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setPanel = useCallback((p: Panel | null) => {
    clearTimeout(closeTimer.current);
    setClosing(false);
    setPanelState(p);
    const path = p?.kind === "event" ? `/calendar/${p.key}` : "/calendar";
    if (window.location.pathname !== path)
      window.history.replaceState(null, "", path);
  }, []);
  // Plays the exit animation, then removes the panel.
  const close = useCallback(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPanel(null), reduce ? 0 : 140);
  }, [setPanel]);

  // Opens the session in the URL: /calendar/<slug>, or /calendar?event=<id> from older links.
  useEffect(() => {
    const url = new URL(window.location.href);
    const key =
      url.pathname.match(/^\/calendar\/([^/]+)/)?.[1] ??
      url.searchParams.get("event");
    if (!key) return;
    // The URL is only readable after hydration, so this can't be initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanel({ kind: "event", key: decodeURIComponent(key) });
  }, [setPanel]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = ptDayKey(e.start);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [events]);

  // "14 sessions, hosted by 9 members. "
  const summary = useMemo(() => {
    const sessions = events.filter((e) => e.kind !== "deadline" && !e.canceled);
    if (!sessions.length) return "";
    const hosts = new Set(sessions.flatMap((e) => e.hosts.map((h) => h._id)))
      .size;
    return `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}, hosted by ${hosts} ${hosts === 1 ? "member" : "members"}. `;
  }, [events]);

  const open = (e: CalendarEvent) => setPanel({ kind: "event", key: e.slug });
  const panelEvent =
    panel && "key" in panel
      ? events.find((e) => e.slug === panel.key || e._id === panel.key)
      : undefined;

  // Keep the tab title in step with the open session (the URL changes without a navigation).
  const openTitle =
    panelEvent && panel?.kind === "event" ? panelEvent.title : null;
  useEffect(() => {
    document.title = `${openTitle ?? "Calendar"} · Just Write`;
  }, [openTitle]);

  return (
    <div className="flex min-h-full">
      <main className="mx-auto flex w-full max-w-[84rem] min-w-0 flex-col gap-6 px-[clamp(16px,3.5vw,48px)] py-[clamp(20px,4vh,44px)]">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[clamp(38px,5.5vw,64px)] leading-[0.95] font-[330] tracking-[-0.03em]">
              November <span className="wonk text-brass-numeral">2026</span>
            </h1>
            <p className="text-[16px] text-ink-muted">
              {summary}Essays are due Mondays at 9pm. All times are Pacific.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ViewToggle view={view} onChange={setView} />
            {isMember && (
              <>
                <button
                  type="button"
                  data-opens-panel
                  onClick={() => setPanel({ kind: "subscribe" })}
                  className="cursor-pointer border border-ink/25 px-4 py-2 text-[15px] transition-colors hover:border-ink/60"
                >
                  Add to your calendar
                </button>
                <button
                  type="button"
                  data-opens-panel
                  onClick={() => setPanel({ kind: "new" })}
                  className="cursor-pointer bg-ink px-4 py-2 text-[15px] text-cream transition-colors hover:bg-ink-muted"
                >
                  Propose a session
                </button>
              </>
            )}
          </div>
        </header>

        {view === "month" && now && (
          <ComingUp events={events} now={now} onOpen={open} />
        )}

        {view === "month" && <Legend />}

        {view === "month" ? (
          <MonthGrid
            events={events}
            today={today}
            byDay={byDay}
            onOpen={open}
            onNew={
              isMember ? (day) => setPanel({ kind: "new", day }) : undefined
            }
          />
        ) : (
          <Agenda events={events} now={now ?? 0} today={today} onOpen={open} />
        )}

        {/* Only once we know who's looking, so members don't see it flash. */}
        {!isLoading &&
          (!isAuthenticated || viewer !== undefined) &&
          !viewer?.canEnter && (
            <p className="text-[16px] text-ink-muted">
              {viewer ? (
                "Only committed members can RSVP and see addresses."
              ) : (
                <>
                  <Link href="/sign-in?next=/calendar">Sign in</Link> to RSVP
                  and see addresses.
                </>
              )}
            </p>
          )}
      </main>

      {panel && (
        <SidePanel onClose={close} closing={closing}>
          {panel.kind === "subscribe" ? (
            <Subscribe onClose={close} />
          ) : panel.kind === "new" ? (
            <EventEditor
              day={panel.day}
              onDone={(key) =>
                key ? setPanel({ kind: "event", key }) : close()
              }
            />
          ) : !panelEvent ? (
            <>
              <PanelHeader label="Not found" onClose={close} />
              <p className="px-6 py-6 text-[16px] text-ink-muted">
                No session at this link.
              </p>
            </>
          ) : panel.kind === "edit" ? (
            <EventEditor
              event={panelEvent}
              onDone={() => setPanel({ kind: "event", key: panelEvent.slug })}
            />
          ) : (
            <EventPanel
              event={panelEvent}
              isMember={isMember}
              signedIn={!!viewer}
              onClose={close}
              now={now ?? 0}
              onEdit={() => setPanel({ kind: "edit", key: panelEvent.slug })}
            />
          )}
        </SidePanel>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "month" | "list";
  onChange: (v: "month" | "list") => void;
}) {
  return (
    <div
      role="group"
      aria-label="View"
      className="flex border border-ink/25 p-0.5"
    >
      {(["month", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`cursor-pointer px-3.5 py-1.5 text-[15px] transition-colors ${
            view === v ? "bg-ink text-cream" : "hover:bg-ink/6"
          }`}
        >
          {v === "month" ? "Month" : "List"}
        </button>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-muted">
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-3.5 w-5 ${chipLook(false, false)}`}
        />
        In person
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-3.5 w-5 ${chipLook(true, false)}`}
        />
        Online
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-3.5 w-5 ${chipLook(false, true)}`}
        />
        You’re going
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-[3px] w-5 bg-brass" />
        Essay due, 9pm
      </li>
    </ul>
  );
}

// Shared by chips and the legend: a soft lavender block in person, an outline online,
// and a brass edge on anything you've said yes or maybe to.
function chipLook(online: boolean, mine: boolean) {
  return `border-l-[3px] ${mine ? "border-l-brass" : online ? "border-l-wash" : "border-l-ink-muted"} ${
    online
      ? "outline outline-1 -outline-offset-1 outline-ink/15 hover:bg-ink/[0.04]"
      : "bg-wash-light/60 hover:bg-wash-light"
  }`;
}

// The next few sessions, with who's hosting and who's going.
function ComingUp({
  events,
  now,
  onOpen,
}: {
  events: CalendarEvent[];
  now: number;
  onOpen: (e: CalendarEvent) => void;
}) {
  const next = events
    .filter((e) => e.kind !== "deadline" && !e.canceled && e.end >= now)
    .slice(0, 3);
  if (!next.length) return null;
  const today = ptDayKey(now);
  return (
    <section aria-labelledby="coming-up" className="flex flex-col gap-3">
      <h2
        id="coming-up"
        className="text-[13px] tracking-[0.14em] text-brass-text uppercase"
      >
        Coming up
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {next.map((e) => {
          const p = ptParts(e.start);
          const day = ptDayKey(e.start);
          const live = e.start <= now;
          const going = e.rsvps.yes;
          const mine = e.myRsvp === "yes" || e.myRsvp === "maybe";
          return (
            <li key={e._id} className="flex">
              <button
                type="button"
                data-opens-panel
                onClick={() => onOpen(e)}
                className={`flex w-full cursor-pointer gap-4 border border-ink/10 bg-paper p-4 text-left transition-colors hover:border-ink/30 ${
                  mine ? "border-l-[3px] border-l-brass" : ""
                }`}
              >
                <span className="flex w-11 shrink-0 flex-col items-center">
                  <span className="text-[13px] text-ink-muted">
                    {day === today ? (
                      <span className="text-brass-text">Today</span>
                    ) : (
                      WEEKDAYS[p.weekday]
                    )}
                  </span>
                  <span className="font-display text-[34px] leading-none font-[330] tabular-nums">
                    {p.day}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 font-display text-[19px] leading-tight font-[430]">
                    {e.title}
                  </span>
                  <span className="text-[14px] text-ink-muted tabular-nums">
                    {live ? (
                      <span className="text-brass-text">Happening now</span>
                    ) : (
                      fmtTimeRange(e.start, e.end)
                    )}
                    {" · "}
                    {e.location ?? (isOnline(e) ? "Online" : "In person")}
                  </span>
                  <span className="mt-auto flex items-center gap-2 pt-1 text-[14px]">
                    <span className="flex -space-x-1.5">
                      {e.hosts.slice(0, 3).map((h) => (
                        <Avatar
                          key={h._id}
                          member={h}
                          size={22}
                          className="ring-2 ring-paper"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 truncate">
                      <span className="text-ink-muted">Hosted by </span>
                      {firstNames(e.hosts)}
                    </span>
                  </span>
                  {going.length > 0 && (
                    <span className="flex items-center gap-2 text-[14px] text-ink-muted">
                      <span className="flex -space-x-1.5">
                        {going.slice(0, 5).map((m) => (
                          <Avatar
                            key={m._id}
                            member={m}
                            size={18}
                            className="ring-2 ring-paper"
                          />
                        ))}
                      </span>
                      {going.length} going
                      {e.myRsvp === "yes" && (
                        <span className="text-brass-text">· including you</span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Online-only sessions have a call link and no address.
export const isOnline = (e: CalendarEvent) => e.hasLink && !e.hasLocation;

function MonthGrid({
  events,
  today,
  byDay,
  onOpen,
  onNew,
}: {
  events: CalendarEvent[];
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  onOpen: (e: CalendarEvent) => void;
  onNew?: (day: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // Whole weeks from the program's first Sunday, stretched for sessions just outside it.
  let from = PROGRAM_FIRST;
  let to = PROGRAM_END;
  for (const e of events) {
    if (e.canceled) continue;
    const k = ptDayKey(e.start);
    if (k < from && k >= GRID_MIN) from = k;
    if (k > to && k <= GRID_MAX) to = k;
  }
  const a = new Date(`${from}T00:00:00Z`);
  a.setUTCDate(a.getUTCDate() - a.getUTCDay());
  const b = new Date(`${to}T00:00:00Z`);
  b.setUTCDate(b.getUTCDate() + 6 - b.getUTCDay());
  const total = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  const cells = Array.from({ length: total }, (_, i) => {
    const d = new Date(a.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const active = key >= PROGRAM_FIRST && key <= PROGRAM_END;
    // Days outside November get their month next to the numeral.
    const label =
      d.getUTCMonth() !== 10 && (i === 0 || d.getUTCDate() === 1)
        ? shortMonth.format(d)
        : null;
    return { key, day: d.getUTCDate(), label, active };
  });
  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="border-t border-l border-ink/10">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="border-r border-b border-ink/10 px-2 py-2 text-[13px] text-ink-muted md:px-3"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const list = byDay.get(c.key) ?? [];
            const deadline = list.find((e) => e.kind === "deadline");
            const sessions = list.filter((e) => e.kind !== "deadline");
            const isToday = c.key === today;
            const past = !!today && c.key < today;
            return (
              <div
                key={c.key}
                className={`group relative flex min-h-[4.5rem] flex-col gap-1 border-r border-b border-ink/10 p-1 md:min-h-[9rem] md:p-1.5 ${
                  deadline && !past
                    ? "bg-brass/[0.07]"
                    : past || !c.active
                      ? ""
                      : "bg-paper"
                } ${isToday ? "ring-1 ring-ink/50 ring-inset" : ""}`}
              >
                {deadline && (
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-[3px] bg-brass ${past ? "opacity-40" : ""}`}
                  />
                )}
                <div className="flex items-start justify-between gap-1">
                  {/* On small screens the numeral selects the day; the day's sessions list below. */}
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(c.key === selected ? null : c.key)
                    }
                    aria-label={`${fmtLongDay(ptToUtc(...(c.key.split("-").map(Number) as [number, number, number]), 12))}${list.length ? `, ${list.length} on the calendar` : ""}`}
                    className={`flex size-8 shrink-0 cursor-pointer items-center justify-center font-display text-[17px] tabular-nums md:pointer-events-none md:size-9 md:text-[20px] ${
                      isToday
                        ? "rounded-full bg-ink text-cream"
                        : selected === c.key
                          ? "rounded-full ring-1 ring-ink"
                          : past || !c.active
                            ? "text-ink/35"
                            : ""
                    }`}
                  >
                    {c.day}
                  </button>
                  {c.label && (
                    <span className="mr-auto self-center text-[13px] text-ink-muted">
                      {c.label}
                    </span>
                  )}
                  {onNew && !past && c.active && (
                    <button
                      type="button"
                      data-opens-panel
                      onClick={() => onNew(c.key)}
                      aria-label={`Propose a session on ${c.key}`}
                      className="hidden size-7 cursor-pointer items-center justify-center text-[18px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 md:flex"
                    >
                      +
                    </button>
                  )}
                </div>
                {deadline && (
                  <button
                    type="button"
                    data-opens-panel
                    onClick={() => onOpen(deadline)}
                    className={`hidden cursor-pointer px-1 text-left text-[13px] leading-tight font-bold text-brass-text hover:underline md:block ${past ? "opacity-60" : ""}`}
                  >
                    {deadline.title}
                  </button>
                )}
                <ul className="hidden flex-col gap-1 md:flex">
                  {sessions.map((e) => (
                    <li key={e._id} className={past ? "opacity-55" : ""}>
                      <Chip event={e} onOpen={onOpen} />
                    </li>
                  ))}
                </ul>
                {/* Small screens: one mark per session */}
                <div
                  className="flex flex-wrap gap-1 px-1 md:hidden"
                  aria-hidden="true"
                >
                  {deadline && <span className="h-[3px] w-3 bg-brass" />}
                  {sessions.map((e) => (
                    <span
                      key={e._id}
                      className={`size-2 ${e.canceled ? "opacity-30" : ""} ${isOnline(e) ? "border border-ink-muted" : "bg-ink-muted"}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="flex flex-col gap-3 md:hidden">
          <h2 className="font-display text-[22px] font-[420]">
            {fmtLongDay(
              ptToUtc(
                ...(selected.split("-").map(Number) as [
                  number,
                  number,
                  number,
                ]),
                12,
              ),
            )}
          </h2>
          {selectedEvents.length ? (
            <ul className="flex flex-col gap-2">
              {selectedEvents.map((e) => (
                <li key={e._id}>
                  <AgendaRow event={e} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[16px] text-ink-muted">Nothing on this day.</p>
          )}
          {onNew && today && selected >= today && (
            <button
              type="button"
              data-opens-panel
              onClick={() => onNew(selected)}
              className="cursor-pointer self-start text-[16px] underline"
            >
              Propose a session on this day
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  event: e,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: (e: CalendarEvent) => void;
}) {
  const online = isOnline(e);
  const mine = e.myRsvp === "yes" || e.myRsvp === "maybe";
  const going = e.rsvps.yes.length;
  const maybe = e.rsvps.maybe.length;
  const counts =
    going || maybe ? `${going} going${maybe ? `, ${maybe} maybe` : ""}` : "";
  return (
    <button
      type="button"
      data-opens-panel
      onClick={() => onOpen(e)}
      title={`${fmtTimeRange(e.start, e.end)} ${e.title}, hosted by ${firstNames(e.hosts)}${counts ? ` · ${counts}` : ""}`}
      className={`flex w-full cursor-pointer flex-col gap-0.5 px-1.5 py-1 text-left text-[13px] leading-tight transition-colors ${chipLook(online, mine)} ${
        e.canceled ? "opacity-45" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <span className="tabular-nums">{fmtTime(e.start)}</span>
        {online && <span>· Online</span>}
        {counts ? (
          <span
            className={`ml-auto flex shrink-0 items-center gap-0.5 tabular-nums ${mine ? "text-brass-text" : ""}`}
          >
            <PersonIcon />
            <span aria-hidden="true">
              {going}
              {maybe > 0 && <span className="opacity-60">+{maybe}</span>}
            </span>
            <span className="sr-only">
              {counts}
              {mine
                ? e.myRsvp === "yes"
                  ? ", including you"
                  : ", you might go"
                : ""}
            </span>
          </span>
        ) : null}
      </span>
      <span
        className={`line-clamp-2 min-w-0 font-bold break-words ${e.canceled ? "line-through" : ""}`}
      >
        {e.title}
      </span>
      {e.hosts.length > 0 && (
        <span className="flex min-w-0 items-center gap-1 text-[12px] text-ink-muted">
          <span className="flex shrink-0 -space-x-1">
            {e.hosts.slice(0, 2).map((h) => (
              <Avatar key={h._id} member={h} size={15} />
            ))}
          </span>
          <span className="truncate">{firstNames(e.hosts)}</span>
        </span>
      )}
    </button>
  );
}

function PersonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-[11px]"
      fill="currentColor"
    >
      <circle cx="6" cy="3.5" r="2.25" />
      <path d="M1.5 11c0-2.5 2-4.25 4.5-4.25S10.5 8.5 10.5 11z" />
    </svg>
  );
}

// List view: upcoming sessions by day, with past ones behind a toggle.
function Agenda({
  events,
  now,
  today,
  onOpen,
}: {
  events: CalendarEvent[];
  now: number;
  today: string;
  onOpen: (e: CalendarEvent) => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const past = events.filter((e) => e.end < now);
  const shown = showPast ? events : events.filter((e) => e.end >= now);
  const days: { key: string; start: number; events: CalendarEvent[] }[] = [];
  for (const e of shown) {
    const key = ptDayKey(e.start);
    const last = days[days.length - 1];
    if (last?.key === key) last.events.push(e);
    else days.push({ key, start: e.start, events: [e] });
  }

  return (
    <div className="flex flex-col gap-2">
      {past.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((s) => !s)}
          className="cursor-pointer self-start text-[15px] text-ink-muted underline"
        >
          {showPast
            ? "Hide past sessions"
            : `Show past sessions (${past.length})`}
        </button>
      )}
      {days.length === 0 && (
        <p className="py-10 text-[17px] text-ink-muted">
          No upcoming sessions.
        </p>
      )}
      <ol className="flex flex-col">
        {days.map((d, i) => {
          const p = ptParts(d.start);
          const prev = i > 0 ? ptParts(days[i - 1].start) : null;
          const newMonth = !prev || prev.month !== p.month;
          return (
            <li key={d.key} className="flex flex-col">
              {newMonth && (
                <h2 className="pt-6 pb-3 font-display text-[24px] font-[400] text-ink-muted first:pt-2">
                  {monthName.format(Date.UTC(p.year, p.month - 1, 1))}
                </h2>
              )}
              <div
                className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 border-t border-ink/15 py-4 md:grid-cols-[7rem_minmax(0,1fr)] md:gap-8 ${
                  d.key < today ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-display text-[clamp(34px,4vw,48px)] leading-none font-[330] tabular-nums">
                    {p.day}
                  </span>
                  <span className="text-[14px] text-ink-muted">
                    {d.key === today ? (
                      <span className="text-brass-text">Today</span>
                    ) : (
                      WEEKDAYS[p.weekday]
                    )}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {d.events.map((e) => (
                    <li key={e._id}>
                      <AgendaRow event={e} onOpen={onOpen} />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AgendaRow({
  event: e,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: (e: CalendarEvent) => void;
}) {
  if (e.kind === "deadline")
    return (
      <button
        type="button"
        data-opens-panel
        onClick={() => onOpen(e)}
        className="flex w-full cursor-pointer items-baseline gap-3 border-l-[3px] border-brass bg-brass/[0.07] px-4 py-2.5 text-left hover:bg-brass/[0.12]"
      >
        <span className="font-display text-[19px] font-[450] text-brass-text">
          {e.title}
        </span>
        <span className="text-[15px] text-ink-muted">9pm PT</span>
      </button>
    );
  const going = e.rsvps.yes.length;
  const maybe = e.rsvps.maybe.length;
  return (
    <button
      type="button"
      data-opens-panel
      onClick={() => onOpen(e)}
      className={`flex w-full cursor-pointer flex-col gap-1.5 border-l-[3px] px-4 py-3 text-left transition-colors hover:bg-ink/[0.04] ${
        isOnline(e) ? "border-ink/30" : "border-ink"
      }`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span
          className={`font-display text-[21px] leading-tight font-[430] ${e.canceled ? "line-through" : ""}`}
        >
          {e.title}
        </span>
        <span className="text-[15px] text-ink-muted tabular-nums">
          {fmtTimeRange(e.start, e.end)} PT
        </span>
        {e.canceled && (
          <span className="text-[15px] font-bold text-brass-text">
            Canceled
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-muted">
        <span>
          {e.location ??
            (isOnline(e)
              ? "Online"
              : e.hasLocation
                ? "Address for members"
                : "Location TBD")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex -space-x-1.5">
            {e.hosts.slice(0, 3).map((h) => (
              <Avatar
                key={h._id}
                member={h}
                size={22}
                className="ring-2 ring-cream"
              />
            ))}
          </span>
          {e.hosts.map((h) => h.name.split(" ")[0]).join(", ")}
        </span>
        {(going > 0 || maybe > 0) && (
          <span>
            {going} going{maybe ? `, ${maybe} maybe` : ""}
          </span>
        )}
        {e.myRsvp === "yes" && (
          <span className="text-brass-text">You’re going</span>
        )}
      </span>
    </button>
  );
}

function SidePanel({
  children,
  onClose,
  closing,
}: {
  children: React.ReactNode;
  onClose: () => void;
  closing: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    // A click anywhere outside the panel closes it, except on things that open another panel.
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (!t || ref.current?.contains(t) || t.closest("[data-opens-panel]"))
        return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  return (
    <>
      {/* Dims the page on small screens, where the panel covers most of it. */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/30 lg:hidden ${
          closing
            ? "motion-safe:animate-[fade-out_140ms_ease-in_forwards]"
            : "motion-safe:animate-[fade-in_160ms_ease-out]"
        }`}
      />
      <aside
        ref={ref}
        role="dialog"
        aria-label="Session"
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(30rem,100%)] flex-col overflow-y-auto border-l border-ink/15 bg-cream shadow-[-12px_0_40px_-20px_rgba(56,33,63,0.35)] ${
          closing
            ? "motion-safe:animate-[panel-out_140ms_ease-in_forwards]"
            : "motion-safe:animate-[panel-in_180ms_cubic-bezier(0.2,0.8,0.2,1)]"
        }`}
      >
        {children}
      </aside>
    </>
  );
}
