import { fetchQuery } from "convex/nextjs";
import { cacheLife, cacheTag } from "next/cache";
import { api } from "@/convex/_generated/api";
import { Calendar, type DotEssay } from "./calendar";

const pacificDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

// November essays grouped by the Pacific date they were registered.
async function getByDate(): Promise<Record<number, DotEssay[]>> {
  "use cache";
  cacheTag("essays");
  cacheLife("minutes");
  try {
    const rows = await fetchQuery(api.essays.published, {});
    const byDate: Record<number, DotEssay[]> = {};
    for (const e of rows.toReversed()) {
      const parts = pacificDay.formatToParts(e.submittedAt);
      const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value);
      if (get("year") !== 2026 || get("month") !== 11) continue;
      (byDate[get("day")] ??= []).push({
        _id: e._id,
        title: e.title,
        url: e.url,
        author: e.author,
      });
    }
    return byDate;
  } catch (err) {
    console.error("getByDate failed", err);
    return {};
  }
}

export async function CalendarWithEssays() {
  return <Calendar essays={await getByDate()} />;
}
