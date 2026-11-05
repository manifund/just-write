// The /activity page: recent messages that involve the viewer, like Slack's Activity view.
// That's messages that @mention them, and replies in threads they started or replied in
// (only replies posted after they joined the thread). Computed from recent messages
// rather than stored, so it covers past messages and follows edits and deletes.
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

    const picked: { m: Doc<"messages">; kind: "mention" | "reply" }[] = [];
    for (const m of recent) {
      if (picked.length >= MAX_ITEMS) break;
      if (m.authorId === me || !m.text) continue;
      const mentioned = mentionIds(JSON.parse(m.body) as RichNode).includes(me);
      if (mentioned) picked.push({ m, kind: "mention" });
      else if (m.parentId) {
        const at = await joinedAt(m.parentId);
        if (at !== null && m._creationTime > at)
          picked.push({ m, kind: "reply" });
      }
    }

    const channels = new Map<Id<"channels">, Doc<"channels"> | null>();
    const gates = new Map<
      Id<"channels">,
      Awaited<ReturnType<typeof checkInGate>>
    >();
    const items = [];
    for (const { m, kind } of picked) {
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
        text: veil(m, gate).text,
        createdAt: m._creationTime,
        channel: { slug: channel.slug, name: channel.name },
        threadId: m.parentId ?? m._id,
        // The thread's first message, so replies make sense on their own.
        parentText: parent ? veil(parent, gate).text : null,
      });
    }
    const seenAt = (await seenRow(ctx, me))?.seenAt ?? 0;
    return {
      items,
      seenAt,
      unread: items.filter((i) => i.createdAt > seenAt).length,
    };
  },
});

// Records that the viewer has looked at their activity, which clears the sidebar dot.
export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    // Allowed in read-only previews: like chat read markers, it only records what they've seen.
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const row = await seenRow(ctx, member._id);
    const seenAt = Date.now();
    if (row) await ctx.db.patch(row._id, { seenAt });
    else await ctx.db.insert("activitySeen", { memberId: member._id, seenAt });
  },
});

async function seenRow(ctx: QueryCtx, memberId: Id<"members">) {
  return await ctx.db
    .query("activitySeen")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .unique();
}
