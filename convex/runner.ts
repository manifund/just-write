// Functions the @Claude sandbox runner (scripts/improve-runner.ts) calls while it works.
// The sandbox never sees CONVEX_SERVER_SECRET: /api/improve gives it a random key for its own
// run, and these accept only that key, only for that run, and only while it's going. They can
// add checklist lines to the run's card, save the agent's session id, pick up follow-ups,
// show what the agent is doing between lines, and add to the run's log.
// Everything else (pushing, the PR, the merge decision, the final status) happens in
// /api/improve, which holds the real secrets.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { appendLogs, logEvent, taskState } from "./lib/improveLogs";
import { applyReport, checkRunToken, takeFollowUps } from "./server";

export const report = mutation({
  args: {
    id: v.id("improvements"),
    runToken: v.string(),
    step: v.optional(v.string()),
    fail: v.optional(v.boolean()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, { id, runToken, step, fail, sessionId }) => {
    const r = await checkRunToken(ctx, id, runToken);
    await applyReport(ctx, r, {
      step: step?.slice(0, 200),
      fail,
      patch: sessionId ? { sessionId: sessionId.slice(0, 200) } : {},
    });
  },
});

export const followUps = mutation({
  args: { id: v.id("improvements"), runToken: v.string() },
  handler: async (ctx, { id, runToken }) =>
    await takeFollowUps(ctx, await checkRunToken(ctx, id, runToken)),
});

// A batch of log events (convex/lib/improveLogs.ts caps their size).
export const log = mutation({
  args: {
    id: v.id("improvements"),
    runToken: v.string(),
    events: v.array(logEvent),
  },
  handler: async (ctx, { id, runToken, events }) => {
    await checkRunToken(ctx, id, runToken);
    await appendLogs(ctx, id, events, { fromRunner: true });
  },
});

// What the agent is doing right now, for the card. Ages are in ms, so the sandbox's clock
// doesn't matter. Nothing open and no tasks clears it.
export const activity = mutation({
  args: {
    id: v.id("improvements"),
    runToken: v.string(),
    idleMs: v.number(),
    tool: v.optional(v.object({ name: v.string(), forMs: v.number() })),
    tasks: v.array(
      v.object({
        label: v.string(),
        state: taskState,
        summary: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { id, runToken, idleMs, tool, tasks }) => {
    await checkRunToken(ctx, id, runToken);
    const now = Date.now();
    const ago = (ms: number) =>
      now - Math.min(Math.max(ms, 0), 24 * 60 * 60_000);
    await ctx.db.patch(id, {
      activity:
        !tool && tasks.length === 0
          ? undefined
          : {
              lastAt: ago(idleMs),
              tool: tool
                ? { name: tool.name.slice(0, 60), since: ago(tool.forMs) }
                : undefined,
              tasks: tasks.slice(-8).map((t) => ({
                label: t.label.slice(0, 120),
                state: t.state,
                summary: t.summary?.slice(0, 160),
              })),
            },
    });
  },
});
