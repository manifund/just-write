// The detailed log of an @Claude run (/improvements/<id>/log, members only). The runner sends
// what the agent does in batches (convex/runner.ts#log); checklist steps and the final status
// are added here as they're reported, so the route's own steps (push, PR) show up too.
import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { LOG_BATCH_EVENTS, LOG_EVENT_CHARS, clip } from "./improve";

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
type LogEvent = Infer<typeof logEvent>;

// A subagent or background command the agent started (the card's activity line).
export const taskState = v.union(
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("stopped"),
);
export type TaskState = Infer<typeof taskState>;

// Caps, so a long run can't fill the table: each event's text (LOG_EVENT_CHARS), events per
// batch (LOG_BATCH_EVENTS), and the whole run. When the runner's events reach the run cap,
// one note is written and the rest of them are dropped. Steps and the final status, added on
// the server, get some room past it, so a long run's log still shows how it ended.
const LOG_RUN_EVENTS = 5000;
const LOG_RUN_CHARS = 2_000_000;
const SERVER_HEADROOM_EVENTS = 200;
const SERVER_HEADROOM_CHARS = 200_000;
const FULL = "The log reached its size limit, so the rest of this run isn’t recorded.";

export async function appendLogs(
  ctx: MutationCtx,
  improvementId: Id<"improvements">,
  events: LogEvent[],
  { fromRunner = false }: { fromRunner?: boolean } = {},
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
  const maxEvents = LOG_RUN_EVENTS + (fromRunner ? 0 : SERVER_HEADROOM_EVENTS);
  const maxChars = LOG_RUN_CHARS + (fromRunner ? 0 : SERVER_HEADROOM_CHARS);
  const now = Date.now();
  const insert = (e: Omit<LogEvent, "ago">, at: number) =>
    ctx.db.insert("improvementLogs", { improvementId, seq, at, chars, ...e });
  for (const e of events.slice(0, LOG_BATCH_EVENTS)) {
    if (seq >= maxEvents || chars >= maxChars) return; // already full
    const text = clip(e.text, LOG_EVENT_CHARS);
    seq++;
    if (seq >= maxEvents || chars + text.length > maxChars) {
      chars = maxChars; // marks the log full
      await insert({ kind: "info", text: FULL }, now);
      return;
    }
    chars += text.length;
    await insert(
      { kind: e.kind, text, ...(e.agent ? { agent: e.agent.slice(0, 120) } : {}) },
      now - Math.min(Math.max(e.ago ?? 0, 0), 10 * 60_000),
    );
  }
}
