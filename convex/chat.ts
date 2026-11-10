import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { markSeenInChat } from "./lib/seen";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  CHECK_IN_PREVIEW_CHARS,
  CHECK_IN_SLUG,
  DEFAULT_CHANNELS,
  RECENT_SIZE,
} from "./lib/channels";
import { forgetActivity } from "./lib/activity";
import { postMessage } from "./lib/messages";
import { nextPtMidnight } from "./lib/time";
import { DEADLINES, fillSlots } from "./lib/program";
import { isReaction } from "./lib/reactions";
import { ensureClaude, startFromMessage } from "./improvements";
import { getClaude } from "./lib/claude";
import {
  cleanBody,
  mentionIds,
  plainText,
  type RichNode,
} from "./lib/richtext";
import { isAdminEmail, requireAdmin, requireMember } from "./lib/viewer";

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
    await ensureClaude(ctx);
  },
});

// Deletes an empty channel (and its read markers and typing rows). Run with
//   bunx convex run chat:removeChannel '{"slug": "..."}'
// Also drop it from DEFAULT_CHANNELS, or seedChannels will recreate it.
export const removeChannel = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!channel) throw new ConvexError(`No channel #${slug}.`);
    const message = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) => q.eq("channelId", channel._id))
      .first();
    if (message) throw new ConvexError(`#${slug} still has messages.`);
    for (const t of await ctx.db
      .query("typing")
      .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
      .collect())
      await ctx.db.delete(t._id);
    for (const r of await ctx.db
      .query("reads")
      .filter((q) => q.eq(q.field("channelId"), channel._id))
      .collect())
      await ctx.db.delete(r._id);
    await ctx.db.delete(channel._id);
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
        const latest = await latestPost(ctx, c._id);
        const read = await ctx.db
          .query("reads")
          .withIndex("by_member_channel", (q) =>
            q.eq("memberId", member._id).eq("channelId", c._id),
          )
          .unique();
        return {
          ...c,
          unread: isUnread(latest, member._id, read?.lastReadAt),
          lastMessageAt: latest?._creationTime ?? null,
          // #check-ins: whether the viewer still has to post before reading others' posts.
          locked: !!(await checkInGate(ctx, c, member)),
        };
      }),
    );
  },
});

async function latestPost(ctx: QueryCtx, channelId: Id<"channels">) {
  return await ctx.db
    .query("messages")
    .withIndex("by_channel_parent", (q) =>
      q.eq("channelId", channelId).eq("parentId", undefined),
    )
    .order("desc")
    .first();
}

// Whether a channel's newest top-level message is from someone else and newer than the member's last read.
function isUnread(
  latest: Doc<"messages"> | null,
  memberId: Id<"members">,
  lastReadAt = 0,
) {
  return (
    !!latest &&
    latest.authorId !== memberId &&
    latest._creationTime > lastReadAt
  );
}

// How many channels each member has unread, for the app icon badge.
export async function unreadCounts(ctx: QueryCtx, memberIds: Id<"members">[]) {
  const channels = await ctx.db.query("channels").collect();
  const latest = await Promise.all(channels.map((c) => latestPost(ctx, c._id)));
  const counts = await Promise.all(
    memberIds.map(async (memberId) => {
      const reads = await ctx.db
        .query("reads")
        .withIndex("by_member_channel", (q) => q.eq("memberId", memberId))
        .collect();
      const lastRead = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
      return channels.filter((c, i) =>
        isUnread(latest[i], memberId, lastRead.get(c._id)),
      ).length;
    }),
  );
  return new Map(memberIds.map((id, i) => [id, counts[i]]));
}

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

// #check-ins is gated: until you've posted a top-level check-in yourself today (Pacific
// time; the day turns over at midnight), everyone else's posts and thread replies show
// only their first 100 characters. Posts you could already read stay readable: anything
// written before the end of the day of your last check-in, plus replies in those threads.
// An essay that counts toward a week also unlocks that week's check-ins: everything
// posted after the previous deadline and before midnight PT at the end of that week's
// deadline day, so the rest of deadline Monday is included. The channel's oldest post,
// when an admin wrote it, is the standing intro and always shows in full. Returns null
// when nothing should be hidden from this viewer.
type Gate = {
  viewerId: Id<"members">;
  introId: Id<"messages"> | null;
  seenUntil: number;
  // [from, until) windows of check-ins unlocked by the viewer's essays, one per week.
  weeks: [number, number][];
};
export async function checkInGate(
  ctx: QueryCtx,
  c: Doc<"channels">,
  member: Doc<"members">,
): Promise<Gate | null> {
  if (c.slug !== CHECK_IN_SLUG) return null;
  const lastOwn = await ctx.db
    .query("messages")
    .withIndex("by_channel_parent_author", (q) =>
      q
        .eq("channelId", c._id)
        .eq("parentId", undefined)
        .eq("authorId", member._id),
    )
    .order("desc")
    .first();
  const seenUntil = lastOwn ? nextPtMidnight(lastOwn._creationTime) : 0;
  const now = Date.now();
  if (seenUntil > now) return null;
  const essays = await ctx.db
    .query("essays")
    .withIndex("by_member", (q) => q.eq("memberId", member._id))
    .collect();
  const weeks = fillSlots(essays)
    .filter((s) => s.essayIds.length > 0)
    .map((s): [number, number] => [
      s.week === 1 ? 0 : DEADLINES[s.week - 2],
      nextPtMidnight(s.deadline),
    ]);
  if (weeks.some(([from, until]) => from <= now && now < until)) return null;
  const first = await ctx.db
    .query("messages")
    .withIndex("by_channel_parent", (q) =>
      q.eq("channelId", c._id).eq("parentId", undefined),
    )
    .order("asc")
    .first();
  const firstAuthor = first ? await ctx.db.get(first.authorId) : null;
  const introId =
    first && firstAuthor && isAdminEmail(firstAuthor.email) ? first._id : null;
  return { viewerId: member._id, introId, seenUntil, weeks };
}

const unlocked = (gate: Gate, t: number) =>
  t < gate.seenUntil ||
  gate.weeks.some(([from, until]) => from <= t && t < until);

// Replaces a message's body with a short preview when the gate hides it. Pass the
// thread's parent for replies, so replies to a post the viewer has seen stay readable.
export function veil(
  m: Doc<"messages">,
  gate: Gate | null,
  parent?: Doc<"messages"> | null,
) {
  if (
    !gate ||
    m.authorId === gate.viewerId ||
    m._id === gate.introId ||
    unlocked(gate, m._creationTime) ||
    (parent && unlocked(gate, parent._creationTime)) ||
    m.kind ||
    m.essayId ||
    m.eventId ||
    m.improvementId
  )
    return { ...m, hidden: false };
  const flat = m.text.replace(/\s+/g, " ").trim();
  const preview =
    flat.length > CHECK_IN_PREVIEW_CHARS
      ? flat.slice(0, CHECK_IN_PREVIEW_CHARS).trimEnd() + "…"
      : flat;
  const body: RichNode = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: preview }] },
    ],
  };
  return { ...m, hidden: true, text: preview, body: JSON.stringify(body) };
}

// Adds reactions and the linked essay to each message, and hides what the viewer
// hasn't earned yet (see checkInGate).
async function hydrate(
  ctx: QueryCtx,
  msgs: Doc<"messages">[],
  gate: Gate | null,
  parent?: Doc<"messages"> | null,
) {
  return await Promise.all(
    msgs
      .map((m) => veil(m, gate, m.parentId ? parent : null))
      .map(async (m) => {
        const reacts = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", m._id))
          .collect();
        const grouped = new Map<string, Id<"members">[]>();
        for (const r of reacts)
          grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.memberId]);
        const essay = m.essayId ? await ctx.db.get(m.essayId) : null;
        const event = m.eventId ? await ctx.db.get(m.eventId) : null;
        return {
          ...m,
          postedFor: m.postedFrom ? await postedFor(ctx, m.postedFrom) : null,
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
          // Claude's status card (improvementId) loads itself: see improvements.card.
          event: event
            ? {
                _id: event._id,
                slug: event.slug ?? event._id,
                title: event.title,
                start: event.start,
                end: event.end,
                canceled: !!event.canceledAt,
                location: event.location ?? null,
              }
            : null,
        };
      }),
  );
}
export type ChatMessage = Awaited<ReturnType<typeof hydrate>>[number];

// Who asked for something Claude posted (a chat task's result, convex/chatTasks.ts), and
// the thread they asked in. Shown under the post; that member can delete it.
async function postedFor(ctx: QueryCtx, runId: Id<"improvements">) {
  const run = await ctx.db.get(runId);
  if (!run) return null;
  const [asker, channel] = await Promise.all([
    ctx.db.get(run.requesterId),
    ctx.db.get(run.channelId),
  ]);
  if (!asker || !channel) return null;
  return {
    memberId: asker._id,
    name: asker.name,
    threadHref: `/chat/${channel.slug}/${run.threadId}`,
  };
}

// Top-level messages in a channel, newest first (the UI reverses them).
export const messages = query({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { slug, paginationOpts }) => {
    const { member } = await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const result = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) =>
        q.eq("channelId", c._id).eq("parentId", undefined),
      )
      .order("desc")
      .paginate(paginationOpts);
    const gate = await checkInGate(ctx, c, member);
    return { ...result, page: await hydrate(ctx, result.page, gate) };
  },
});

// The newest messages in a channel, newest first. The sidebar keeps this subscribed for
// every channel so switching channels can show messages right away, before `messages` loads.
export const recent = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const { member } = await requireMember(ctx);
    const c = await channelBySlug(ctx, slug);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) =>
        q.eq("channelId", c._id).eq("parentId", undefined),
      )
      .order("desc")
      .take(RECENT_SIZE + 1);
    const gate = await checkInGate(ctx, c, member);
    return {
      messages: await hydrate(ctx, rows.slice(0, RECENT_SIZE), gate),
      more: rows.length > RECENT_SIZE,
    };
  },
});

// A thread: the parent message and its replies, oldest first.
// Takes a plain string because it can come from a thread link; a bad id reads as deleted.
export const thread = query({
  args: { parentId: v.string() },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const parentId = ctx.db.normalizeId("messages", args.parentId);
    const parent = parentId && (await ctx.db.get(parentId));
    if (!parent) return null;
    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parent._id))
      .collect();
    const c = await ctx.db.get(parent.channelId);
    const gate = c ? await checkInGate(ctx, c, member) : null;
    const [hydratedParent, ...hydratedReplies] = await hydrate(
      ctx,
      [parent, ...replies],
      gate,
      parent,
    );
    return { parent: hydratedParent, replies: hydratedReplies };
  },
});

// A short preview of one message, for links to it posted in chat. Takes a plain string
// because it comes from a pasted link; a bad id reads as deleted (null). Follows the
// #check-ins gate like everywhere else.
const LINK_PREVIEW_CHARS = 280;
export const linkPreview = query({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const id = ctx.db.normalizeId("messages", args.messageId);
    const m = id && (await ctx.db.get(id));
    if (!m) return null;
    const c = await ctx.db.get(m.channelId);
    if (!c) return null;
    const parent = m.parentId ? await ctx.db.get(m.parentId) : null;
    const gate = await checkInGate(ctx, c, member);
    const shown = veil(m, gate, parent);
    const essay = m.essayId ? await ctx.db.get(m.essayId) : null;
    const event = m.eventId ? await ctx.db.get(m.eventId) : null;
    const flat = (
      essay
        ? `published an essay: ${essay.title}`
        : event
          ? `scheduled a session: ${event.title}`
          : m.kind === "joined"
            ? "joined Just Write"
            : shown.text
    )
      .replace(/\s+/g, " ")
      .trim();
    return {
      _id: m._id,
      _creationTime: m._creationTime,
      authorId: m.authorId,
      channelSlug: c.slug,
      channelName: c.name,
      inThread: !!m.parentId,
      hidden: shown.hidden,
      text:
        flat.length > LINK_PREVIEW_CHARS
          ? flat.slice(0, LINK_PREVIEW_CHARS).trimEnd() + "…"
          : flat,
    };
  },
});

// Images in messages: the composer gets an upload URL, uploads the file, then
// calls imageUrl to check it and get the address to show while composing.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 10;

export const imageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

async function storedImageUrl(ctx: MutationCtx, id: Id<"_storage">) {
  const file = await ctx.db.system.get(id);
  if (
    !file ||
    !file.contentType?.startsWith("image/") ||
    file.contentType.includes("svg") ||
    file.size > MAX_IMAGE_BYTES
  )
    return null;
  return await ctx.storage.getUrl(id);
}

export const imageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireMember(ctx);
    const url = await storedImageUrl(ctx, storageId);
    if (!url) {
      const file = await ctx.db.system.get(storageId);
      if (file) await ctx.storage.delete(storageId);
      throw new ConvexError("Please use an image under 10 MB.");
    }
    return url;
  },
});

// Replaces each image's `src` with the URL of the uploaded file it names, and
// drops images that don't point at a stored image.
async function withImages(
  ctx: MutationCtx,
  cleaned: { body: string; text: string },
): Promise<{ body: string; text: string }> {
  const doc = JSON.parse(cleaned.body) as RichNode;
  if (!doc.content?.some((n) => n.type === "image")) return cleaned;
  let count = 0;
  const content: RichNode[] = [];
  for (const n of doc.content) {
    if (n.type !== "image") {
      content.push(n);
      continue;
    }
    const id = ctx.db.system.normalizeId("_storage", String(n.attrs?.id ?? ""));
    const src = id && count < MAX_IMAGES ? await storedImageUrl(ctx, id) : null;
    if (!src) continue;
    count++;
    content.push({ ...n, attrs: { ...n.attrs, src } });
  }
  const out: RichNode = { ...doc, content };
  return { body: JSON.stringify(out), text: plainText(out).trim() };
}

export const send = mutation({
  args: {
    slug: v.string(),
    body: v.string(),
    parentId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const { member, isAdmin } = await requireMember(ctx);
    const c = await channelBySlug(ctx, args.slug);
    const { body, text } = await withImages(ctx, cleanBody(args.body));
    if (!text) throw new ConvexError("Write something first.");

    const parentId = args.parentId;
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

    const id = await postMessage(ctx, {
      channelId: c._id,
      authorId: member._id,
      body,
      text,
      parentId: args.parentId,
    });
    await clearTyping(ctx, member._id, c._id);

    const claude = await getClaude(ctx);
    if (claude && mentionIds(JSON.parse(body) as RichNode).includes(claude._id))
      await startFromMessage(ctx, {
        member,
        isAdmin,
        channelId: c._id,
        messageId: id,
        parentId,
        text,
      });
    else if (parentId && c.slug !== CHECK_IN_SLUG)
      await passUntaggedReply(ctx, parentId, member._id, text);
    return id;
  },
});

// A reply in a thread where a code run is going reaches the agent even without @Claude, the
// way a tagged one does (server.takeFollowUps). Never from #check-ins, whose text stays gated.
// Chat tasks don't take follow-ups, and once a run ends, an untagged reply does nothing.
const UNTAGGED_PER_RUN = 20;
async function passUntaggedReply(
  ctx: MutationCtx,
  threadId: Id<"messages">,
  authorId: Id<"members">,
  text: string,
) {
  const run = (
    await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(10)
  ).find((r) => !r.kind && r.status === "running");
  if (!run) return;
  const pending = run.untaggedReplies ?? [];
  if (pending.length >= UNTAGGED_PER_RUN) return;
  await ctx.db.patch(run._id, {
    untaggedReplies: [...pending, { authorId, text: text.slice(0, 4000) }],
  });
}

export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const m = await ctx.db.get(args.messageId);
    if (!m || m.authorId !== member._id)
      throw new ConvexError("You can only edit your own messages.");
    if (m.essayId || m.eventId || m.kind)
      throw new ConvexError("This post can’t be edited.");
    const { body, text } = await withImages(ctx, cleanBody(args.body));
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
    // Something Claude posted for a member is theirs to delete too.
    const askedBy = m.postedFrom
      ? (await ctx.db.get(m.postedFrom))?.requesterId
      : null;
    if (m.authorId !== member._id && askedBy !== member._id && !isAdmin)
      throw new ConvexError("You can only delete your own messages.");
    // Deleting a post takes its thread with it, and those replies aren't the asker's.
    if (m.authorId !== member._id && !isAdmin && (m.replyCount ?? 0) > 0)
      throw new ConvexError(
        "This has replies now, so ask an admin to remove it.",
      );
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
      await forgetActivity(ctx, doomed._id);
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
    if (!isReaction(emoji)) throw new ConvexError("Unknown reaction.");
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
    // Allowed in read-only previews: it only records what this person has seen.
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
    await markSeenInChat(ctx, member._id, { channelId: c._id });
  },
});

// Marks a thread's replies as seen in Activity while the viewer has it open.
export const markThreadRead = mutation({
  args: { parentId: v.id("messages") },
  handler: async (ctx, { parentId }) => {
    // Allowed in read-only previews: it only records what this person has seen.
    const { member } = await requireMember(ctx, { allowReadonly: true });
    await markSeenInChat(ctx, member._id, { parentId });
  },
});

// Mark a top-level message and everything after it as unread, by moving the
// member's read marker to just before it.
export const markUnread = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const { member } = await requireMember(ctx);
    const m = await ctx.db.get(messageId);
    if (!m) throw new ConvexError("That message was deleted.");
    if (m.parentId)
      throw new ConvexError("Only channel messages can be marked unread.");
    const lastReadAt = m._creationTime - 1;
    const read = await ctx.db
      .query("reads")
      .withIndex("by_member_channel", (q) =>
        q.eq("memberId", member._id).eq("channelId", m.channelId),
      )
      .unique();
    if (read) await ctx.db.patch(read._id, { lastReadAt });
    else
      await ctx.db.insert("reads", {
        memberId: member._id,
        channelId: m.channelId,
        lastReadAt,
      });
  },
});

// Typing indicators. The client calls this at most every few seconds while typing;
// entries expire on their own, and the UI ignores expired ones.
export const setTyping = mutation({
  args: { slug: v.string(), parentId: v.optional(v.id("messages")) },
  handler: async (ctx, { slug, parentId }) => {
    const { member, readonly } = await requireMember(ctx, {
      allowReadonly: true,
    });
    if (readonly) return; // nothing they type gets sent, so don't show them typing
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

// /check-ins: the viewer's own top-level #check-ins posts, newest first. Only their own,
// so nothing here is behind the gate.
export const myCheckIns = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", CHECK_IN_SLUG))
      .unique();
    if (!channel) return [];
    const posts = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent_author", (q) =>
        q
          .eq("channelId", channel._id)
          .eq("parentId", undefined)
          .eq("authorId", member._id),
      )
      .order("desc")
      .collect();
    return posts.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      body: m.body,
      text: m.text,
      replyCount: m.replyCount ?? 0,
    }));
  },
});
