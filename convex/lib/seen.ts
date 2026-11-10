// Marking Activity items read once they've been seen in chat (convex/activity.ts has
// the page). chat.markRead calls it for a channel, chat.markThreadRead for an open thread.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Marks Activity items read once the viewer has seen them in chat: top-level messages
// when they read the channel, or a thread's replies while they have it open. Only touches
// their unread rows, so it stays cheap to call on every read.
export async function markSeenInChat(
  ctx: MutationCtx,
  memberId: Id<"members">,
  where: { channelId: Id<"channels"> } | { parentId: Id<"messages"> },
) {
  const now = Date.now();
  const unread = await ctx.db
    .query("activity")
    .withIndex("by_member_unread", (q) =>
      q.eq("memberId", memberId).eq("readAt", undefined),
    )
    .collect();
  for (const row of unread) {
    if (row.at > now) continue;
    const m = await ctx.db.get(row.messageId);
    if (!m) continue;
    const seen =
      "channelId" in where
        ? !m.parentId && m.channelId === where.channelId
        : m.parentId === where.parentId;
    if (seen) await ctx.db.patch(row._id, { readAt: now });
  }
}
