// Keeps open @Claude PRs up to date with main (lib/improve-sync.ts). GitHub calls happen in
// Next.js, which has GITHUB_TOKEN; these functions say which PRs are safe to update and record
// which ones conflict. Guarded by CONVEX_SERVER_SECRET, like convex/server.ts.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalAction, mutation, query } from "./_generated/server";
import { checkServerSecret } from "./lib/viewer";

// Whether a code run in the thread is queued or running. Such a run may be about to push to
// the PR, and finishRun refuses to push if the branch moved under it, so its PR is left alone.
export function threadBusy(rows: Pick<Doc<"improvements">, "kind" | "status">[]) {
  return rows.some(
    (r) => r.kind !== "chat" && (r.status === "queued" || r.status === "running"),
  );
}

// A PR's card (its newest run with the Merge button), and whether its thread is busy. Asked right
// before each update, so a run that starts later clones the updated branch.
export const prState = query({
  args: { secret: v.string(), prNumber: v.number() },
  handler: async (ctx, { secret, prNumber }) => {
    checkServerSecret(secret);
    const runs = await ctx.db
      .query("improvements")
      .withIndex("by_pr", (q) => q.eq("prNumber", prNumber))
      .order("desc")
      .collect();
    // The card with the Merge button, unless no run on the PR has one.
    const card = runs.find((r) => r.status === "pr") ?? runs[0];
    if (!card) return { id: null, busy: false };
    const inThread = await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", card.threadId))
      .collect();
    return { id: card._id, busy: threadBusy(inThread) };
  },
});

// Shows (or clears) "conflicts with newer changes" on a PR's card.
export const markConflicts = mutation({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    conflicts: v.boolean(),
  },
  handler: async (ctx, { secret, id, conflicts }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    if (!r || (r.conflictsWithMain ?? false) === conflicts) return;
    await ctx.db.patch(id, { conflictsWithMain: conflicts || undefined });
  },
});

// The cron's sweep (convex/crons.ts): catches merges done on GitHub directly. The route does
// the work; it's next to IMPROVE_URL, so there's nothing new to configure.
export const sweep = internalAction({
  args: {},
  handler: async () => {
    const url = process.env.IMPROVE_URL;
    if (!url) return;
    const res = await fetch(`${url.replace(/\/$/, "")}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: process.env.CONVEX_SERVER_SECRET }),
    });
    if (!res.ok)
      console.error(
        "PR sync failed",
        res.status,
        (await res.text()).slice(0, 300),
      );
  },
});
