// November 2026 schedule. Nov 1, 2026 is a Sunday, so each row starts on a Sunday.
// Edit WEEKS to change dates; the grid is generated from it.

export type Event = "kickoff" | "essay" | "circle" | "wrap";

type Day = {
  date: number;
  event?: Event;
  /** Spills into December; shown dimmed */
  outside?: boolean;
};

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
    { date: 2, event: "wrap" },
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
  wrap: "bg-cream font-semibold text-ink group-hover/day:bg-white",
};

const swatch: Record<Event, string> = {
  kickoff: "bg-brass",
  essay: "border border-brass",
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

const dayStyle = (day: Day) =>
  day.event
    ? `${mark[day.event]} ${dayLit[day.event]} ring-cream/70 ring-offset-2 ring-offset-ink`
    : day.outside
      ? "text-cream/30"
      : "text-cream group-hover/day:bg-cream/10";

const row = "grid grid-cols-7";
const circle = "size-[clamp(32px,4.6vh,38px)]";
const ease = "transition duration-150 motion-reduce:transition-none";

export function Calendar() {
  return (
    // Legend sits beside the grid when there's room, otherwise in two columns below it.
    <div className="group/cal @container relative mt-auto cursor-default select-none max-md:mt-3">
      <div className="flex flex-col gap-6 @min-[580px]:flex-row @min-[580px]:items-end @min-[580px]:gap-[clamp(28px,3.5vw,48px)]">
        <div className="flex w-full flex-col md:max-w-[370px]">
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
              className={`${row} justify-items-center pb-2 text-xs text-wash-light/80`}
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
                    className="group/day flex justify-center py-[clamp(2px,0.6vh,6px)]"
                  >
                    <span
                      className={`flex ${circle} items-center justify-center rounded-full text-base ${ease} ${dayStyle(day)}`}
                    >
                      {day.date}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
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
