// November 2026 schedule. Nov 1, 2026 is a Sunday, so each row starts on a Sunday.
// Edit this array to change dates; the grid is generated from it.

type Day = {
  date: number;
  /** Saturday writing circle at Mox SF */
  circle?: boolean;
  /** Kickoff or wrap party */
  milestone?: boolean;
};

type Week = { label: string; days: Day[] };

const range = (from: number, to: number): Day[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ date: from + i }));

const week = (label: string, start: number): Week => {
  const days = range(start, start + 6);
  days[6].circle = true; // Saturday
  return { label, days };
};

const WEEKS: Week[] = [
  week("Wk 1", 1),
  week("Wk 2", 8),
  week("Wk 3", 15),
  week("Wk 4", 22),
  { label: "Wrap", days: [{ date: 29 }, { date: 30 }, { date: 1 }] },
];
WEEKS[0].days[0].milestone = true; // Nov 1 kickoff
WEEKS[4].days[2].milestone = true; // Dec 1 wrap party

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const row = "grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1.5";
const label = "text-[13px] tracking-[0.1em] uppercase text-wash-light";

export function Calendar() {
  return (
    <div className="relative mt-auto hidden max-w-[470px] flex-col gap-3 md:flex">
      <div role="grid" aria-label="November 2026 schedule" className="flex flex-col gap-1.5">
        <div role="row" className={`${row} ${label}`}>
          <span role="columnheader">Nov</span>
          {WEEKDAYS.map((d, i) => (
            <span role="columnheader" key={i} className="text-center">
              {d}
            </span>
          ))}
        </div>
        {WEEKS.map((w) => (
          <div role="row" key={w.label} className={`${row} items-center`}>
            <span role="rowheader" className={label}>
              {w.label}
            </span>
            {Array.from({ length: 7 }, (_, i) => {
              const day = w.days[i];
              if (!day) return <div key={i} className="h-[clamp(32px,4.8vh,44px)]" />;
              return (
                <div
                  role="gridcell"
                  key={i}
                  className={`flex h-[clamp(32px,4.8vh,44px)] flex-col items-center justify-center gap-[3px] border text-base text-cream ${
                    day.milestone
                      ? "border-brass bg-brass/14"
                      : "border-cream/22"
                  }`}
                >
                  <span>{day.date}</span>
                  {day.circle && (
                    <span className="size-[5px] rounded-full bg-brass" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1.5 text-[15px] text-wash-light">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brass" />
          Saturday writing circle, Mox SF
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 border border-brass" />
          Kickoff &amp; wrap
        </span>
      </div>
    </div>
  );
}
