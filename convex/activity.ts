// The /activity page: recent messages that involve the viewer, like Slack's Activity view.
// That's messages that @mention them, and replies in threads they started or replied in
// (only replies posted after they joined the thread). Computed from recent messages
// rather than stored, so it covers past messages and follows edits and deletes.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { checkInGate, veil } from "./chat";
import { mentionIds, type RichNode } from "./lib/richtext";
import { requireMember } from "./lib/viewer";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SCANNED = 1500;
const MAX_ITEMS = 60;

export const feed = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const me = member._id;
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_creation_time", (q) =>
        q.gt("_creationTime", Date.now() - WINDOW_MS),
      )
      .order("desc")
      .take(MAX_SCANNED);

    // When the viewer joined each thread that has recent replies, or null if they never did.
    const joined = new Map<Id<"messages">, number | null>();
    const joinedAt = async (parentId: Id<"messages">) => {
      if (joined.has(parentId)) return joined.get(parentId) ?? null;
      let at: number | null = null;
      const parent = await ctx.db.get(parentId);
      if (parent?.authorId === me) at = parent._creationTime;
      else if (parent) {
        const mine = (
          await ctx.db
            .query("messages")
            .withIndex("by_parent", (q) => q.eq("parentId", parentId))
            .collect()
        ).find((r) => r.authorId === me);
        at = mine?._creationTime ?? null;
      }
      joined.set(parentId, at);
      return at;
    };

    const picked: {
      m: Doc<"messages">;
      kind: "mention" | "reply";
      text: string;
      at: number;
    }[] = [];
    for (const m of recent) {
      if (picked.length >= MAX_ITEMS) break;
      if (m.authorId === me) continue;
      let text = m.text;
      let at = m._creationTime;
      // @Claude's reply card is an empty message filled in from its run, so it shows
      // once the run has a reply, dated when the run finished.
      if (!text && m.improvementId) {
        const run = await ctx.db.get(m.improvementId);
        text = run?.summary ?? run?.error ?? "";
        at = run?.finishedAt ?? at;
      }
      if (!text) continue;
      const mentioned = mentionIds(JSON.parse(m.body) as RichNode).includes(me);
      if (mentioned) picked.push({ m, kind: "mention", text, at });
      else if (m.parentId) {
        const joinedTime = await joinedAt(m.parentId);
        if (joinedTime !== null && m._creationTime > joinedTime)
          picked.push({ m, kind: "reply", text, at });
      }
    }
    picked.sort((a, b) => b.at - a.at);

    const channels = new Map<Id<"channels">, Doc<"channels"> | null>();
    const gates = new Map<
      Id<"channels">,
      Awaited<ReturnType<typeof checkInGate>>
    >();
    const items = [];
    for (const { m, kind, text, at } of picked) {
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
        kind,
        authorId: m.authorId,
        text: veil({ ...m, text }, gate, parent).text,
        createdAt: at,
        channel: { slug: channel.slug, name: channel.name },
        channelId: channel._id,
        threadId: m.parentId ?? m._id,
        // The thread's first message, so replies make sense on their own.
        parentText: parent ? veil(parent, gate).text : null,
      });
    }
    const row = await seenRow(ctx, me);
    const seenAt = row?.seenAt ?? 0;
    const readIds = new Set(row?.readIds ?? []);
    // Items already seen in chat count as read too: top-level messages up to the
    // channel's read marker, and replies up to when the viewer last had the thread open.
    const channelReads = new Map(
      (
        await ctx.db
          .query("reads")
          .withIndex("by_member_channel", (q) => q.eq("memberId", me))
          .collect()
      ).map((r) => [r.channelId, r.lastReadAt]),
    );
    const threadReads = new Map<Id<"messages">, number>();
    for (const threadId of new Set(
      picked.flatMap(({ m }) => (m.parentId ? [m.parentId] : [])),
    )) {
      const r = await ctx.db
        .query("threadReads")
        .withIndex("by_member_thread", (q) =>
          q.eq("memberId", me).eq("threadId", threadId),
        )
        .unique();
      if (r) threadReads.set(threadId, r.lastReadAt);
    }
    const withRead = items.map(({ channelId, ...i }) => {
      const chatReadAt =
        i.threadId === i._id
          ? channelReads.get(channelId)
          : threadReads.get(i.threadId);
      return {
        ...i,
        read:
          i.createdAt <= seenAt ||
          readIds.has(i._id) ||
          (chatReadAt !== undefined && i.createdAt <= chatReadAt),
      };
    });
    return {
      items: withRead,
      unread: withRead.filter((i) => !i.read).length,
    };
  },
});

const MAX_READ_IDS = 300;

// Marks one item read, when the viewer opens it from /activity.
export const markRead = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    // Allowed in read-only previews: like chat read markers, it only records what they've seen.
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const row = await seenRow(ctx, member._id);
    if (!row) {
      await ctx.db.insert("activitySeen", {
        memberId: member._id,
        seenAt: 0,
        readIds: [messageId],
      });
      return;
    }
    const ids = row.readIds ?? [];
    if (ids.includes(messageId)) return;
    await ctx.db.patch(row._id, {
      readIds: [...ids, messageId].slice(-MAX_READ_IDS),
    });
  },
});

// Marks everything read ("Mark all as read"), which clears the sidebar count.
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    // Allowed in read-only previews: like chat read markers, it only records what they've seen.
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const row = await seenRow(ctx, member._id);
    const seenAt = Date.now();
    if (row) await ctx.db.patch(row._id, { seenAt, readIds: [] });
    else await ctx.db.insert("activitySeen", { memberId: member._id, seenAt });
  },
});

async function seenRow(ctx: QueryCtx, memberId: Id<"members">) {
  return await ctx.db
    .query("activitySeen")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .unique();
}
