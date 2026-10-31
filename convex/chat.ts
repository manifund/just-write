import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { DEFAULT_CHANNELS, PAGE_SIZE } from "./lib/channels";
import { REACTIONS } from "./lib/reactions";
import { cleanBody } from "./lib/richtext";
import { requireAdmin, requireMember } from "./lib/viewer";

// Creates the default channels, or updates their names and descriptions. Run once per deployment:
//   bunx convex run chat:seedChannels
export const seedChannels = internalMutation({
  args: {},
  handler: async (ctx) => {
    let order = 0;
    for (const c of DEFAULT_CHANNELS) {
      const existing = await ctx.db
        .query("channels")
        .withIndex("by_slug", (q) => q.eq("slug", c.slug))
        .unique();
      if (existing)
        await ctx.db.patch(existing._id, {
          name: c.name,
          description: c.description,
        });
      else await ctx.db.insert("channels", { ...c, order });
      order++;
    }
  },
});

export const createChannel = mutation({
  args: { slug: v.string(), name: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const slug = args.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,30}$/.test(slug))
      throw new ConvexError("Channel slugs use a–z, 0–9, and dashes.");
    const existing = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new ConvexError("That channel already exists.");
    const all = await ctx.db.query("channels").collect();
    return await ctx.db.insert("channels", {
      slug,
      name: args.name.trim() || slug,
      description: args.description.trim(),
      order: all.length,
    });
  },
});

// Channels in order, each with whether it has messages the viewer hasn't seen.
export const channels = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const rows = (await ctx.db.query("channels").collect()).sort(
      (a, b) => a.order - b.order,
    );
    return await Promise.all(
      rows.map(async (c) => {
        const latest = await ctx.db
          .query("messages")
          .withIndex("by_channel_parent", (q) =>
            q.eq("channelId", c._id).eq("parentId", undefined),
          )
          .order("desc")
          .first();
        const read = await ctx.db
          .query("reads")
          .withIndex("by_member_channel", (q) =>
            q.eq("memberId", member._id).eq("channelId", c._id),
          )
          .unique();
        const unread =
          !!latest &&
          latest.authorId !== member._id &&
          latest._creationTime > (read?.lastReadAt ?? 0);
        return { ...c, unread, lastMessageAt: latest?._creationTime ?? null };
      }),
    );
  },
});

async function channelBySlug(ctx: QueryCtx, slug: string) {
  const c = await ctx.db
    .query("channels")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!c) throw new ConvexError("No such channel.");
  return c;
}

export const channel = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireMember(ctx);
    return await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

// Adds reactions and the linked essay to each message.
async function hydrate(ctx: QueryCtx, msgs: Doc<"messages">[]) {
  return await Promise.all(
    msgs.map(async (m) => {
      const reacts = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", m._id))
        .collect();
      const grouped = new Map<string, Id<"members">[]>();
      for (const r of reacts)
        grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.memberId]);
      const essay = m.essayId ? await ctx.db.get(m.essayId) : null;
      return {
        ...m,
        reactions: [...grouped].map(([emoji, memberIds]) => ({
          emoji,
          memberIds,
        })),
        essay: essay
          ? {
              title: essay.title,
              url: essay.url,
              wordCount: essay.wordCount ?? null,
            }
          : null,
      };
    }),
  );
}
export type ChatMessage = Awaited<ReturnType<typeof hydrate>>[number];

// Top-level messages in a channel, newest first (the UI reverses them).
export const messages = query({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { slug, paginationOpts }) => {
    await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const result = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) =>
        q.eq("channelId", c._id).eq("parentId", undefined),
      )
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: await hydrate(ctx, result.page) };
  },
});

// The newest page of a channel, newest first. The sidebar keeps this subscribed for every
// channel so switching channels can show messages right away, before `messages` loads.
export const recent = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) =>
        q.eq("channelId", c._id).eq("parentId", undefined),
      )
      .order("desc")
      .take(PAGE_SIZE + 1);
    return {
      messages: await hydrate(ctx, rows.slice(0, PAGE_SIZE)),
      more: rows.length > PAGE_SIZE,
    };
  },
});

// A thread: the parent message and its replies, oldest first.
export const thread = query({
  args: { parentId: v.id("messages") },
  handler: async (ctx, { parentId }) => {
    await requireMember(ctx);
    const parent = await ctx.db.get(parentId);
    if (!parent) return null;
    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .collect();
    const [hydratedParent, ...hydratedReplies] = await hydrate(ctx, [
      parent,
      ...replies,
    ]);
    return { parent: hydratedParent, replies: hydratedReplies };
  },
});

export const send = mutation({
  args: {
    slug: v.string(),
    body: v.string(),
    parentId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const c = await channelBySlug(ctx, args.slug);
    const { body, text } = cleanBody(args.body);
    if (!text) throw new ConvexError("Write something first.");

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.channelId !== c._id || parent.parentId)
        throw new ConvexError("Can’t reply there.");
      const repliers = [
        member._id,
        ...(parent.replierIds ?? []).filter((id) => id !== member._id),
      ].slice(0, 3);
      await ctx.db.patch(parent._id, {
        replyCount: (parent.replyCount ?? 0) + 1,
        lastReplyAt: Date.now(),
        replierIds: repliers,
      });
    }

    const id = await ctx.db.insert("messages", {
      channelId: c._id,
      authorId: member._id,
      body,
      text,
      parentId: args.parentId,
    });
    await clearTyping(ctx, member._id, c._id);
    return id;
  },
});

export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const m = await ctx.db.get(args.messageId);
    if (!m || m.authorId !== member._id)
      throw new ConvexError("You can only edit your own messages.");
    const { body, text } = cleanBody(args.body);
    if (!text) throw new ConvexError("Write something first.");
    await ctx.db.patch(m._id, { body, text, editedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { member, isAdmin } = await requireMember(ctx);
    const m = await ctx.db.get(messageId);
    if (!m) return;
    if (m.authorId !== member._id && !isAdmin)
      throw new ConvexError("You can only delete your own messages.");
    if (m.essayId)
      throw new ConvexError(
        "Remove the essay from your progress page instead.",
      );

    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", m._id))
      .collect();
    for (const doomed of [m, ...replies]) {
      const reacts = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", doomed._id))
        .collect();
      for (const r of reacts) await ctx.db.delete(r._id);
      await ctx.db.delete(doomed._id);
    }
    if (m.parentId) {
      const parent = await ctx.db.get(m.parentId);
      if (parent)
        await ctx.db.patch(parent._id, {
          replyCount: Math.max(0, (parent.replyCount ?? 1) - 1),
        });
    }
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    const { member } = await requireMember(ctx);
    if (!REACTIONS.includes(emoji)) throw new ConvexError("Unknown reaction.");
    if (!(await ctx.db.get(messageId)))
      throw new ConvexError("That message is gone.");
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_member_emoji", (q) =>
        q
          .eq("messageId", messageId)
          .eq("memberId", member._id)
          .eq("emoji", emoji),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    else
      await ctx.db.insert("reactions", {
        messageId,
        memberId: member._id,
        emoji,
      });
  },
});

export const markRead = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const { member } = await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const read = await ctx.db
      .query("reads")
      .withIndex("by_member_channel", (q) =>
        q.eq("memberId", member._id).eq("channelId", c._id),
      )
      .unique();
    const now = Date.now();
    if (read) await ctx.db.patch(read._id, { lastReadAt: now });
    else
      await ctx.db.insert("reads", {
        memberId: member._id,
        channelId: c._id,
        lastReadAt: now,
      });
  },
});

// Typing indicators. The client calls this at most every few seconds while typing;
// entries expire on their own, and the UI ignores expired ones.
export const setTyping = mutation({
  args: { slug: v.string(), parentId: v.optional(v.id("messages")) },
  handler: async (ctx, { slug, parentId }) => {
    const { member } = await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const expiresAt = Date.now() + 6000;
    const existing = await ctx.db
      .query("typing")
      .withIndex("by_member_channel", (q) =>
        q.eq("memberId", member._id).eq("channelId", c._id),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { expiresAt, parentId });
    else
      await ctx.db.insert("typing", {
        channelId: c._id,
        memberId: member._id,
        parentId,
        expiresAt,
      });
  },
});

async function clearTyping(
  ctx: MutationCtx,
  memberId: Id<"members">,
  channelId: Id<"channels">,
) {
  const existing = await ctx.db
    .query("typing")
    .withIndex("by_member_channel", (q) =>
      q.eq("memberId", memberId).eq("channelId", channelId),
    )
    .unique();
  if (existing) await ctx.db.delete(existing._id);
}

export const typing = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const { member } = await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_channel", (q) => q.eq("channelId", c._id))
      .collect();
    return rows
      .filter((r) => r.memberId !== member._id)
      .map((r) => ({
        memberId: r.memberId,
        parentId: r.parentId ?? null,
        expiresAt: r.expiresAt,
      }));
  },
});
