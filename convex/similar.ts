import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { publicMember, requireMember } from "./lib/viewer";

const TTL = 24 * 60 * 60 * 1000;

// What the model sees about each writer: bio, essay titles, shared ideas.
async function profiles(ctx: QueryCtx) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "committed"))
    .collect();
  return await Promise.all(
    members.map(async (m) => {
      const essays = await ctx.db
        .query("essays")
        .withIndex("by_member", (q) => q.eq("memberId", m._id))
        .collect();
      const ideas = await ctx.db
        .query("ideas")
        .withIndex("by_member", (q) => q.eq("memberId", m._id))
        .collect();
      return {
        id: m._id,
        name: m.name,
        website: m.link ?? "",
        bio: m.bio ?? "",
        essays: essays
          .filter((e) => e.review !== "rejected")
          .map((e) => e.title),
        ideas: ideas
          .filter((i) => i.shared)
          .map((i) =>
            i.notes ? `${i.title}: ${i.notes.slice(0, 200)}` : i.title,
          ),
      };
    }),
  );
}

// Cheap fingerprint of everything the picks depend on, so edits trigger a refresh.
function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function currentHash(ctx: QueryCtx) {
  return hash(JSON.stringify(await profiles(ctx)));
}

export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const row = await ctx.db
      .query("similar")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .unique();
    const picks = row
      ? (
          await Promise.all(
            row.picks.map(async (p) => {
              const m = await ctx.db.get(p.memberId);
              return m ? { member: publicMember(m), reason: p.reason } : null;
            }),
          )
        ).filter((p) => p !== null)
      : [];
    const stale =
      !row ||
      Date.now() - row.computedAt > TTL ||
      row.inputHash !== (await currentHash(ctx));
    return { picks, stale, computedAt: row?.computedAt ?? null };
  },
});

// Asks for fresh picks. Debounced: at most one computation per member every 2 minutes.
export const request = mutation({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const row = await ctx.db
      .query("similar")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .unique();
    if (row && Date.now() - row.computedAt < 2 * 60 * 1000) return;
    // Bump computedAt first so concurrent requests don't schedule twice.
    if (row) await ctx.db.patch(row._id, { computedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.similarAction.compute, {
      memberId: member._id,
    });
  },
});

export const inputs = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const all = await profiles(ctx);
    return {
      self: all.find((p) => p.id === memberId) ?? null,
      others: all.filter((p) => p.id !== memberId),
      hash: hash(JSON.stringify(all)),
    };
  },
});

export const save = internalMutation({
  args: {
    memberId: v.id("members"),
    picks: v.array(v.object({ memberId: v.id("members"), reason: v.string() })),
    inputHash: v.string(),
  },
  handler: async (ctx, { memberId, picks, inputHash }) => {
    const row = await ctx.db
      .query("similar")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .unique();
    const doc = { memberId, picks, inputHash, computedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("similar", doc);
  },
});

export type SimilarPick = { memberId: Id<"members">; reason: string };
