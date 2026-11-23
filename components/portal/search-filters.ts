// Slack-style filters for message search in "Jump to": from:, in:, before:, after:,
// on:, has:, and is:, anywhere in the box (a space after the colon is fine). The words
// left over are searched; the filters become chat.search's args.
import type { Id } from "@/convex/_generated/dataModel";
import { ptParts, ptToUtc } from "@/convex/lib/time";
import type { PublicMember } from "@/convex/lib/viewer";

const TOKEN = /(^|\s)(from|in|before|after|on|has|is):\s*(\S*)/gi;

export type Token = { key: string; value: string; start: number; end: number };

export function readQuery(q: string) {
  const tokens: Token[] = [];
  let rest = "";
  let last = 0;
  for (const m of q.matchAll(TOKEN)) {
    const start = m.index + m[1].length;
    tokens.push({
      key: m[2].toLowerCase(),
      value: m[3].replace(/^[@#]/, "").toLowerCase(),
      start,
      end: m.index + m[0].length,
    });
    rest += q.slice(last, start) + " ";
    last = m.index + m[0].length;
  }
  rest += q.slice(last);
  return { tokens, rest: rest.replace(/\s+/g, " ").trim() };
}

// The box with one filter's value replaced, for picking a suggestion.
export function fillToken(q: string, t: Token, value: string) {
  return `${q.slice(0, t.start)}${t.key}:${value} ${q.slice(t.end).trimStart()}`;
}

// What from: takes for a member: their handle, or their name without spaces.
export const fromToken = (m: PublicMember) =>
  (m.handle ?? m.name.replace(/\s+/g, "")).toLowerCase();

export type SearchFilters = {
  from?: Id<"members">;
  channel?: Id<"channels">;
  after?: number;
  before?: number;
  has?: "link" | "image";
  thread?: boolean;
};

export type Option = { label: string; value: string; detail: string };

type Channel = { _id: Id<"channels">; name: string; slug: string };

// Turns the filters into search args. `pick` is the first filter that's still unclear,
// with what it could be; `problem` is a filter that can't be read.
export function resolveFilters(
  tokens: Token[],
  {
    roster,
    channels,
    meId,
    now,
  }: {
    roster: Map<string, PublicMember>;
    channels: Channel[];
    meId: string;
    now: number;
  },
) {
  const filters: SearchFilters = {};
  const names: string[] = []; // for "No messages from Tazik in #site match."
  let pick: { token: Token; options: Option[] } | null = null;
  let problem: string | null = null;
  const choose = (token: Token, options: Option[], none: string) => {
    const exact = options.find((o) => o.value === token.value);
    if (exact) return exact;
    if (token.value && options.length === 1) return options[0];
    if (!options.length) problem ??= none;
    else pick ??= { token, options };
    return null;
  };
  for (const t of tokens) {
    if (t.key === "from") {
      const people = [...roster.values()]
        .filter((m) => {
          if (!t.value) return !m.bot;
          return (
            fromToken(m).startsWith(t.value) ||
            m.name
              .toLowerCase()
              .split(/\s+/)
              .some((w) => w.startsWith(t.value))
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const options = people.map((m) => ({
        label: m.name,
        value: fromToken(m),
        detail: m._id,
      }));
      if (t.value === "me") {
        filters.from = meId as Id<"members">;
        names.push("from you");
        continue;
      }
      const o = choose(t, options, "No one by that name.");
      if (o) {
        filters.from = o.detail as Id<"members">;
        names.push(`from ${o.label}`);
      }
    } else if (t.key === "in") {
      const options = channels
        .filter(
          (c) =>
            c.slug.startsWith(t.value) ||
            c.name.toLowerCase().startsWith(t.value),
        )
        .map((c) => ({ label: `#${c.name}`, value: c.slug, detail: c._id }));
      const o = choose(t, options, "No channel by that name.");
      if (o) {
        filters.channel = o.detail as Id<"channels">;
        names.push(`in ${o.label}`);
      }
    } else if (t.key === "has" || t.key === "is") {
      const all =
        t.key === "has"
          ? [
              { label: "Has a link", value: "link", detail: "" },
              { label: "Has an image", value: "image", detail: "" },
            ]
          : [{ label: "Thread replies", value: "thread", detail: "" }];
      const o = choose(
        t,
        all.filter((x) => x.value.startsWith(t.value)),
        t.key === "has" ? "Try has:link or has:image." : "Try is:thread.",
      );
      if (o?.value === "link" || o?.value === "image") filters.has = o.value;
      if (o?.value === "thread") filters.thread = true;
    } else {
      // before:, after:, on: a Pacific day.
      if (!t.value) {
        pick ??= {
          token: t,
          options: [
            { label: "Today", value: "today", detail: "" },
            { label: "Yesterday", value: "yesterday", detail: "" },
            { label: "A date, like 2026-11-10 or 11/10", value: "", detail: "" },
          ],
        };
        continue;
      }
      const day = readDay(t.value, now);
      if (!day) {
        problem ??= "Write dates like 2026-11-10, 11/10, today, or yesterday.";
        continue;
      }
      const start = ptToUtc(day.year, day.month, day.day);
      const end = ptToUtc(day.year, day.month, day.day + 1);
      if (t.key === "before") filters.before = Math.min(filters.before ?? start, start);
      else if (t.key === "after") filters.after = Math.max(filters.after ?? end, end);
      else {
        filters.after = Math.max(filters.after ?? start, start);
        filters.before = Math.min(filters.before ?? end, end);
      }
    }
  }
  return { filters, names, pick: pick as typeof pick, problem };
}

function readDay(v: string, now: number) {
  const t = ptParts(now);
  if (v === "today") return t;
  if (v === "yesterday") {
    return ptParts(ptToUtc(t.year, t.month, t.day) - 12 * 3600_000);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const day = m
    ? { year: +m[1], month: +m[2], day: +m[3] }
    : (m = /^(\d{1,2})[/-](\d{1,2})$/.exec(v))
      ? { year: t.year, month: +m[1], day: +m[2] }
      : null;
  if (!day || day.month < 1 || day.month > 12 || day.day < 1 || day.day > 31)
    return null;
  return day;
}
