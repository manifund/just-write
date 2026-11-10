// The /activity page: recent messages that involve the viewer, like Slack's Activity view.
// Items are `activity` rows written when a message is posted (convex/lib/activity.ts), so
// the feed is a small indexed read per member. Text is read from the message itself, so
// edits show and deleted messages drop out.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { checkInGate, veil } from "./chat";
import { requireMember } from "./lib/viewer";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 60;

export const feed = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_member", (q) =>
        q.eq("memberId", member._id).gt("at", Date.now() - WINDOW_MS),
      )
      .order("desc")
      .take(MAX_ITEMS);

    const channels = new Map<Id<"channels">, Doc<"channels"> | null>();
    const gates = new Map<
      Id<"channels">,
      Awaited<ReturnType<typeof checkInGate>>
    >();
    const items = [];
    for (const row of rows) {
      const m = await ctx.db.get(row.messageId);
      if (!m) continue;
      let text = m.text;
      // @Claude's reply card is an empty message filled in from its run.
      if (!text && m.improvementId) {
        const run = await ctx.db.get(m.improvementId);
        text = run?.summary ?? run?.error ?? "";
      }
      if (!text) continue;
      if (!channels.has(m.channelId))
        channels.set(m.channelId, await ctx.db.get(m.channelId));
      const channel = channels.get(m.channelId);
      if (!channel) continue;
      if (!gates.has(channel._id))
        gates.set(channel._id, await checkInGate(ctx, channel, member));
      const gate = gates.get(channel._id) ?? null;
      const parent = m.parentId ? await ctx.db.get(m.parentId) : null;
      items.push({
        _id: m._id,
        kind: row.kind,
        authorId: m.authorId,
        text: veil({ ...m, text }, gate, parent).text,
        createdAt: row.at,
        channel: { slug: channel.slug, name: channel.name },
        threadId: m.parentId ?? m._id,
        // The thread's first message, so replies make sense on their own.
        parentText: parent ? veil(parent, gate).text : null,
        read: row.readAt !== undefined,
      });
    }
    return { items, unread: (await unreadRows(ctx, member._id)).length };
  },
});

// How many items the viewer hasn't read, for the sidebar. Reads only their activity rows,
// so it stays cheap to keep subscribed everywhere in the portal.
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    return (await unreadRows(ctx, member._id)).length;
  },
});

async function unreadRows(ctx: QueryCtx, memberId: Id<"members">) {
  return await ctx.db
    .query("activity")
    .withIndex("by_member_unread", (q) =>
      q.eq("memberId", memberId).eq("readAt", undefined),
    )
    .collect();
}

// Marks one item read, when the viewer opens it from /activity.
export const markRead = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    // Allowed in read-only previews: like chat read markers, it only records what they've seen.
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .collect();
    const row = rows.find((r) => r.memberId === member._id);
    if (row && row.readAt === undefined)
      await ctx.db.patch(row._id, { readAt: Date.now() });
  },
});

// Marks everything read ("Mark all as read"), which clears the sidebar count.
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    // Allowed in read-only previews: like chat read markers, it only records what they've seen.
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const now = Date.now();
    for (const row of await unreadRows(ctx, member._id))
      await ctx.db.patch(row._id, { readAt: now });
  },
});
