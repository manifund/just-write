// Everything on the calendar is shown and entered in Pacific time, whatever the viewer's
// own time zone, since the program runs on PT deadlines.
export const TZ = "America/Los_Angeles";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The Pacific-time wall clock for a moment. `month` is 1–12, `weekday` 0 (Sun)–6.
export function ptParts(ms: number) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(ms)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

// The UTC ms for a Pacific wall-clock time (handles PST/PDT).
export function ptToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall + 8 * 3600_000; // PST
  for (let i = 0; i < 2; i++) {
    const p = ptParts(guess);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wall - seen;
  }
  return guess;
}

// The first midnight Pacific after a moment: when that Pacific day ends.
export function nextPtMidnight(ms: number) {
  const p = ptParts(ms);
  return ptToUtc(p.year, p.month, p.day + 1);
}

// "2026-11-07", the Pacific calendar day, for grouping and for <input type="date">.
export function ptDayKey(ms: number) {
  const p = ptParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// "10:00", for <input type="time">.
export function ptTimeValue(ms: number) {
  const p = ptParts(ms);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

// Parses the editor's "2026-11-07" + "10:00" back to UTC ms.
export function fromInputs(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return ptToUtc(y, m, d, h, min);
}

// "10am", "8:45pm", "noon", "midnight".
export function fmtTime(ms: number) {
  const { hour, minute } = ptParts(ms);
  if (minute === 0 && hour === 12) return "noon";
  if (minute === 0 && hour === 0) return "midnight";
  const h = hour % 12 || 12;
  const mm = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${h}${mm}${hour < 12 ? "am" : "pm"}`;
}

// "10am–noon", or "10–11am" when both ends share am/pm.
export function fmtTimeRange(start: number, end: number) {
  const a = fmtTime(start);
  const b = fmtTime(end);
  const suffix = (s: string) => s.match(/(am|pm)$/)?.[1];
  if (suffix(a) && suffix(a) === suffix(b) && ptDayKey(start) === ptDayKey(end))
    return `${a.slice(0, -2)}–${b}`;
  return `${a}–${b}`;
}

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const longDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
});

// "Sat, Nov 7"
export const fmtDay = (ms: number) => dayFmt.format(ms);
// "Saturday, November 7"
export const fmtLongDay = (ms: number) => longDayFmt.format(ms);

// "Sat, Nov 7, 10am–noon PT"
export function fmtWhen(start: number, end: number) {
  if (ptDayKey(start) !== ptDayKey(end))
    return `${fmtDay(start)}, ${fmtTime(start)} – ${fmtDay(end)}, ${fmtTime(end)} PT`;
  return `${fmtDay(start)}, ${fmtTimeRange(start, end)} PT`;
}
