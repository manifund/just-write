import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { publicMember, requireMember } from "./lib/viewer";

async function votesFor(
  ctx: QueryCtx,
  ideaId: Id<"ideas">,
  viewerId: Id<"members">,
) {
  const votes = await ctx.db
    .query("ideaVotes")
    .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
    .collect();
  return {
    votes: votes.length,
    voted: votes.some((v) => v.memberId === viewerId),
  };
}

// The viewer's own ideas.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const rows = await ctx.db
      .query("ideas")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    return await Promise.all(
      rows
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(async (i) => ({
          ...i,
          ...(await votesFor(ctx, i._id, member._id)),
        })),
    );
  },
});

// A member's ideas, for their profile page.
export const forMember = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const viewer = await requireMember(ctx);
    const rows = await ctx.db
      .query("ideas")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
    return await Promise.all(
      rows
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(async (i) => ({
          ...i,
          ...(await votesFor(ctx, i._id, viewer.member._id)),
        })),
    );
  },
});

// Everyone's ideas, newest first.
export const board = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const rows = await ctx.db.query("ideas").order("desc").take(300);
    const out = await Promise.all(
      rows.map(async (i) => {
        const author = await ctx.db.get(i.memberId);
        if (!author) return null;
        return {
          ...i,
          author: publicMember(author),
          ...(await votesFor(ctx, i._id, member._id)),
        };
      }),
    );
    return out
      .filter((i) => i !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

function clean(title: string, notes: string) {
  const t = title.trim().slice(0, 200);
  if (!t) throw new ConvexError("Give your idea a title.");
  return { title: t, notes: notes.trim().slice(0, 4000) || undefined };
}

export const create = mutation({
  args: { title: v.string(), notes: v.string() },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    return await ctx.db.insert("ideas", {
      memberId: member._id,
      ...clean(args.title, args.notes),
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    ideaId: v.id("ideas"),
    title: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.memberId !== member._id)
      throw new ConvexError("Not your idea.");
    await ctx.db.patch(idea._id, {
      ...clean(args.title, args.notes),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, { ideaId }) => {
    const { member } = await requireMember(ctx);
    const idea = await ctx.db.get(ideaId);
    if (!idea || idea.memberId !== member._id)
      throw new ConvexError("Not your idea.");
    const votes = await ctx.db
      .query("ideaVotes")
      .withIndex("by_idea", (q) => q.eq("ideaId", ideaId))
      .collect();
    for (const vote of votes) await ctx.db.delete(vote._id);
    await ctx.db.delete(ideaId);
  },
});

// "I'd read this"
export const toggleVote = mutation({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, { ideaId }) => {
    const { member } = await requireMember(ctx);
    const idea = await ctx.db.get(ideaId);
    if (!idea) throw new ConvexError("That idea was deleted.");
    const existing = await ctx.db
      .query("ideaVotes")
      .withIndex("by_idea_member", (q) =>
        q.eq("ideaId", ideaId).eq("memberId", member._id),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    else await ctx.db.insert("ideaVotes", { ideaId, memberId: member._id });
  },
});
