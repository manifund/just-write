// Functions the @Claude sandbox runner (scripts/improve-runner.ts) calls while it works.
// The sandbox never sees CONVEX_SERVER_SECRET: /api/improve gives it a random key for its own
// run, and these accept only that key, only for that run, and only while it's going. They can
// add checklist lines to the run's card, save the agent's session id, and pick up follow-ups
// and stop requests.
// Everything else (pushing, the PR, the merge decision, the final status) happens in
// /api/improve, which holds the real secrets.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
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

// Polled every few seconds while the agent works. `stop` is the name of whoever pressed Stop
// on the card (improvements.stop); the runner then stops the agent and wraps up. Follow-ups
// aren't taken once a stop is asked for: they start as their own run when this one ends.
export const followUps = mutation({
  args: { id: v.id("improvements"), runToken: v.string() },
  handler: async (ctx, { id, runToken }) => {
    const r = await checkRunToken(ctx, id, runToken);
    if (r.stopRequestedAt) {
      const by = r.stoppedBy && (await ctx.db.get(r.stoppedBy));
      return { followUps: [], stop: by?.name ?? "a member" };
    }
    return { followUps: await takeFollowUps(ctx, r), stop: null };
  },
});
