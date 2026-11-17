// November 2026 schedule. Nov 1, 2026 is a Sunday, so each row starts on a Sunday.
// Edit WEEKS to change dates; the grid is generated from it.

import { TodayDot } from "./today-dot";

export type Event = "kickoff" | "essay" | "circle" | "wrap";

type Day = {
  date: number;
  event?: Event;
  /** Spills into December; shown dimmed */
  outside?: boolean;
  /** In December but not dimmed (the wrap party) */
  december?: boolean;
};

// Only November dates get essay dots and the today marker.
const inNovember = (day: Day) => !day.outside && !day.december;

const week = (start: number): Day[] =>
  Array.from({ length: 7 }, (_, i) => {
    const date = start + i;
    const event: Event | undefined =
      i === 1 && date > 2 ? "essay" : i === 6 ? "circle" : undefined;
    return { date, event };
  });

export const WEEKS: Day[][] = [
  week(1),
  week(8),
  week(15),
  week(22),
  [
    { date: 29 },
    { date: 30, event: "essay" },
    { date: 1, outside: true },
    { date: 2, event: "wrap", december: true },
    { date: 3, outside: true },
    { date: 4, outside: true },
    { date: 5, outside: true },
  ],
];
WEEKS[0][0].event = "kickoff";

export const LEGEND: { event: Event; title: string }[] = [
  { event: "kickoff", title: "Kickoff" },
  { event: "essay", title: "Essay due" },
  { event: "circle", title: "Writing circle" },
  { event: "wrap", title: "Wrap party" },
];

export const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Day styles key off the whole cell (group/day), so hover has no dead gaps.
const mark: Record<Event, string> = {
  kickoff: "bg-brass font-semibold text-ink group-hover/day:bg-brass-light",
  essay:
    "border border-brass font-semibold text-brass-light group-hover/day:bg-brass/20",
  circle: "bg-wash/40 text-cream group-hover/day:bg-wash/65",
  wrap: "bg-cream font-semibold text-ink group-hover/day:bg-paper",
};

const swatch: Record<Event, string> = {
  kickoff: "bg-brass",
  essay: "border border-brass md:border-2 md:border-dashed",
  circle: "bg-wash/40",
  wrap: "bg-cream",
};

// Hovering a date grows its legend swatch; hovering a legend entry rings its dates.
// Tailwind needs these as literal strings, so they're spelled out per event.
const swatchLit: Record<Event, string> = {
  kickoff: "group-has-[[data-event=kickoff]:hover]/cal:scale-115",
  essay: "group-has-[[data-event=essay]:hover]/cal:scale-115",
  circle: "group-has-[[data-event=circle]:hover]/cal:scale-115",
  wrap: "group-has-[[data-event=wrap]:hover]/cal:scale-115",
};
const dayLit: Record<Event, string> = {
  kickoff: "group-has-[[data-legend=kickoff]:hover]/cal:ring-2",
  essay: "group-has-[[data-legend=essay]:hover]/cal:ring-2",
  circle: "group-has-[[data-legend=circle]:hover]/cal:ring-2",
  wrap: "group-has-[[data-legend=wrap]:hover]/cal:ring-2",
};

// On desktop, a deadline day with essays swaps its solid ring for the arcs.
const dayStyle = (day: Day, dotted: boolean) =>
  (day.event === "essay" && dotted ? "md:border-transparent " : "") +
  (day.event
    ? `${mark[day.event]} ${dayLit[day.event]} ring-cream/70 ring-offset-2 ring-offset-ink`
    : day.outside
      ? "text-cream/30"
      : "text-cream group-hover/day:bg-cream/10");

const row = "grid grid-cols-7";
const circle =
  "size-[clamp(32px,4.6vh,38px)] md:size-[clamp(36px,5.4vh,46px)]";
const ease = "transition duration-150 motion-reduce:transition-none";

export type DotEssay = { _id: string; title: string; url: string; author: string };

// Arc geometry, in the SVG's units: the date's circle spans -50..50, so its
// edge is at radius 50 (~42px across on desktop, so 1px is about 2.4 units).
// Each essay is one arc of the circle's edge; together they draw its outline.
// Past RING_CAP essays a second ring starts just outside.
const RADIUS = 50;
const RING_GAP = 11;
const GAP = 9; // space between arcs, along the ring
const MIN_PITCH = 17; // shortest arc plus gap before a second ring starts
const RING_CAP = Math.floor((2 * Math.PI * RADIUS) / MIN_PITCH);

type Arc = { d: string; mx: number; my: number };

// Split n essays into arcs around one ring (or two, split by circumference),
// starting at the top and going clockwise; the outer ring is offset half a
// step so its gaps fall beside the inner ones'.
function arcRing(n: number, width: number): Arc[] {
  const radii = n > RING_CAP ? [RADIUS, RADIUS + RING_GAP] : [RADIUS];
  const total = radii.reduce((a, r) => a + r, 0);
  const counts = radii.map((r) => Math.round((n * r) / total));
  counts[counts.length - 1] += n - counts.reduce((a, c) => a + c, 0);
  const pt = (r: number, a: number) =>
    `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return radii.flatMap((r, ring) => {
    const count = counts[ring];
    const step = (2 * Math.PI) / count;
    // Round caps reach past each end, so leave room for them in the gap.
    const half = Math.max(0.01, (step - (GAP + width) / r) / 2);
    return Array.from({ length: count }, (_, i) => {
      const mid = -Math.PI / 2 + (i + 0.5 + ring / 2) * step;
      const large = half * 2 > Math.PI ? 1 : 0;
      return {
        d: `M ${pt(r, mid - half)} A ${r} ${r} 0 ${large} 1 ${pt(r, mid + half)}`,
        mx: Math.cos(mid) * (r / 100) + 0.5,
        my: Math.sin(mid) * (r / 100) + 0.5,
      };
    });
  });
}

// One arc per essay published that day, drawn as fragments of the date's
// outline. Deadline days use thicker coral arcs in place of their solid ring,
// so they stay the ones you notice; other days use thin lilac ones. Hovering
// or focusing an arc shows the essay beside it; clicking opens it in a new
// tab. Desktop only: the arcs are too small to tap.
function EssayArcs({
  essays,
  col,
  deadline,
}: {
  essays: DotEssay[];
  col: number;
  deadline: boolean;
}) {
  // Keep the pop-up inside the panel: left-aligned near the left edge, right-aligned near the right.
  const align =
    col < 2 ? "left-0" : col > 4 ? "right-0" : "left-1/2 -translate-x-1/2";
  const width = deadline ? 6 : 4;
  const arcs = arcRing(essays.length, width);
  return (
    <span className="max-md:hidden">
      {essays.map((e, i) => {
        const { d, mx, my } = arcs[i];
        // The link covers the whole circle but only its arc takes the pointer,
        // so neighbouring arcs and the date underneath stay hoverable.
        return (
          <a
            key={e._id}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            aria-label={`${e.title}, by ${e.author}`}
            className="group/dot pointer-events-none absolute inset-0 z-10 no-underline outline-none hover:z-20 focus-visible:z-20"
          >
            <svg
              aria-hidden="true"
              viewBox="-50 -50 100 100"
              className="absolute inset-0 size-full overflow-visible"
            >
              <path
                d={d}
                fill="none"
                strokeLinecap="round"
                strokeWidth={width}
                className={`${ease} ${deadline ? "stroke-brass-light" : "stroke-wash-light/85"} group-hover/dot:stroke-cream group-hover/dot:[stroke-width:8] group-focus-visible/dot:stroke-cream group-focus-visible/dot:[stroke-width:8]`}
                style={{ transitionProperty: "stroke, stroke-width" }}
              />
              <path
                d={d}
                fill="none"
                strokeWidth={14}
                stroke="transparent"
                className="cursor-pointer"
                style={{ pointerEvents: "stroke" }}
              />
            </svg>
            <span
              aria-hidden="true"
              className="absolute size-0"
              style={{
                left: `${(mx * 100).toFixed(2)}%`,
                top: `${(my * 100).toFixed(2)}%`,
              }}
            >
              <span
                className={`pointer-events-none absolute bottom-2 ${align} flex w-max max-w-[16em] flex-col rounded-md bg-cream px-3 py-2 text-left opacity-0 shadow-lg ${ease} group-hover/dot:opacity-100 group-focus-visible/dot:opacity-100`}
              >
                <span className="font-display text-[15px] leading-snug font-medium text-ink">
                  {e.title}
                </span>
                <span className="text-[12px] font-normal text-ink-muted">
                  {e.author.trim().split(/\s+/)[0]}
                </span>
              </span>
            </span>
          </a>
        );
      })}
    </span>
  );
}

/** `essays` maps a November date to the essays published that day (Pacific time). */
export function Calendar({
  essays,
}: { essays?: Record<number, DotEssay[]> } = {}) {
  return (
    // Legend sits beside the grid when there's room, otherwise in two columns below it.
    <div className="group/cal @container relative mt-auto cursor-default select-none max-md:mt-3">
      <div className="flex flex-col gap-6 @min-[580px]:flex-row @min-[580px]:items-end @min-[580px]:gap-[clamp(28px,3.5vw,48px)]">
        <div className="flex w-full flex-col md:max-w-[460px]">
          <h2 className="mb-[clamp(14px,2.4vh,22px)] flex items-baseline gap-3 font-display leading-none">
            <span className="text-[clamp(32px,4.6vh,42px)] font-semibold tracking-[-0.015em] text-cream">
              November
            </span>
            <span className="text-xl font-[340] text-wash-light/70">2026</span>
          </h2>
          <div
            role="grid"
            aria-label="November 2026 schedule"
            className="flex flex-col"
          >
            <div
              role="row"
              className={`${row} justify-items-center pb-2 text-xs text-wash-light/80 md:text-sm`}
            >
              {WEEKDAYS.map((d, i) => (
                <span role="columnheader" key={i}>
                  {d}
                </span>
              ))}
            </div>
            {WEEKS.map((days, w) => (
              // Hovering any day tints its week.
              <div
                role="row"
                key={w}
                className={`${row} rounded-full ${ease} has-[[role=gridcell]:hover]:bg-cream/[0.05]`}
              >
                {days.map((day, i) => (
                  <div
                    role="gridcell"
                    key={i}
                    data-event={day.event}
                    className="group/day flex justify-center py-[clamp(2px,0.6vh,6px)] md:py-[clamp(3px,0.8vh,8px)]"
                  >
                    <span
                      className={`relative flex ${circle} items-center justify-center rounded-full text-base md:text-lg ${ease} ${dayStyle(day, inNovember(day) && !!essays?.[day.date]?.length)}`}
                    >
                      {day.date}
                      {inNovember(day) && <TodayDot date={day.date} />}
                      {inNovember(day) && essays?.[day.date] && (
                        <EssayArcs
                          essays={essays[day.date]}
                          col={i}
                          deadline={day.event === "essay"}
                        />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {essays && Object.keys(essays).length > 0 && (
            <p className="mt-3 text-[13px] text-wash-light/70 max-md:hidden">
              Each mark is an essay published that day.
            </p>
          )}
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-3 @min-[580px]:grid-cols-1 @min-[580px]:gap-y-[clamp(10px,1.8vh,18px)]">
          {LEGEND.map((l) => (
            <li
              key={l.event}
              data-legend={l.event}
              className="group/legend flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className={`size-6 shrink-0 rounded-full ${ease} ${swatch[l.event]} ${swatchLit[l.event]} group-hover/legend:scale-115`}
              />
              <span className="font-display text-[17px] leading-tight font-medium text-cream">
                {l.title}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
