"use client";

import { useSyncExternalStore } from "react";

// The landing page is static, so today is worked out in the browser.
// Dates are Pacific time, like the rest of the program.
const todayInNovember = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return get("year") === 2026 && get("month") === 11 ? get("day") : null;
};

// Re-check every minute so the dot moves at midnight.
const subscribe = (onChange: () => void) => {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
};

/** A dot under the date if it's today. Renders nothing on the server. */
export function TodayDot({ date }: { date: number }) {
  const today = useSyncExternalStore(subscribe, todayInNovember, () => null);
  if (today !== date) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
      />
      <span className="sr-only">(today)</span>
    </>
  );
}
