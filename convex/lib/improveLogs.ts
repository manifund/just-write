// The detailed log of an @Claude run (/improvements/<id>/log, admins only). The runner sends
// what the agent does in batches (convex/runner.ts#log); checklist steps and the final status
// are added here as they're reported, so the route's own steps (push, PR) show up too.
import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const logKind = v.union(
  v.literal("step"), // a checklist line
  v.literal("text"), // the agent's own words
  v.literal("tool"), // a tool call and its input
  v.literal("result"), // what a tool call returned
  v.literal("task"), // a subagent or background task started or finished
  v.literal("shell"), // a command the runner ran itself (install, checks)
  v.literal("info"),
  v.literal("error"),
);
export type LogKind = Infer<typeof logKind>;

export const logEvent = v.object({
  kind: logKind,
  text: v.string(),
  agent: v.optional(v.string()), // the subagent it came from, if not the main agent
  ago: v.optional(v.number()), // ms before it was sent, so the sandbox's clock doesn't matter
});
export type LogEvent = Infer<typeof logEvent>;

// Caps, so a long run can't fill the table: each event's text, events per batch, and the whole
// run. Past the run cap one note is written and the rest is dropped.
export const LOG_EVENT_CHARS = 4000;
export const LOG_BATCH_EVENTS = 200;
export const LOG_RUN_EVENTS = 5000;
export const LOG_RUN_CHARS = 2_000_000;

export async function appendLogs(
  ctx: MutationCtx,
  improvementId: Id<"improvements">,
  events: LogEvent[],
) {
  if (events.length === 0) return;
  // The last row carries the running totals (`seq` is the count so far).
  const last = await ctx.db
    .query("improvementLogs")
    .withIndex("by_improvement", (q) => q.eq("improvementId", improvementId))
    .order("desc")
    .first();
  let seq = last?.seq ?? 0;
  let chars = last?.chars ?? 0;
  if (last?.kind === "info" && last.text === FULL) return;
  const now = Date.now();
  for (const e of events.slice(0, LOG_BATCH_EVENTS)) {
    const text = clip(e.text, LOG_EVENT_CHARS);
    const full = seq + 1 >= LOG_RUN_EVENTS || chars + text.length > LOG_RUN_CHARS;
    seq++;
    chars += full ? FULL.length : text.length;
    await ctx.db.insert("improvementLogs", {
      improvementId,
      seq,
      at: now - Math.min(Math.max(e.ago ?? 0, 0), 10 * 60_000),
      kind: full ? "info" : e.kind,
      text: full ? FULL : text,
      agent: full ? undefined : e.agent?.slice(0, 120),
      chars,
    });
    if (full) return;
  }
}

const FULL = "The log reached its size limit, so the rest of this run isn’t recorded.";

export function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}… [${s.length - n} more characters]` : s;
}
