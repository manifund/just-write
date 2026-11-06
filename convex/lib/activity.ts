// Activity rows: who each chat message involves, written when it's posted (see
// convex/activity.ts for the /activity page that reads them). Fanning out at write time
// keeps the feed a small indexed read per member, instead of rescanning every message.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { CLAUDE_EMAIL } from "./improve";
import { mentionIds, type RichNode } from "./richtext";

// Who a message involves: the members it @mentions, and the people already in its thread
// (the first post's author and anyone who replied before it). Push notifications use the
// same sets, so a push and an Activity item always go to the same people.
export async function involvement(ctx: QueryCtx, m: Doc<"messages">) {
  const mentioned = new Set<string>(mentionIds(JSON.parse(m.body) as RichNode));
  const inThread = new Set<string>();
  if (m.parentId) {
    const parent = await ctx.db.get(m.parentId);
    if (parent) inThread.add(parent.authorId);
    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", m.parentId))
      .collect();
    for (const r of replies)
      if (r._creationTime < m._creationTime) inThread.add(r.authorId);
  }
  return { mentioned, inThread };
}

// Adds an Activity item for everyone a message involves, except its author and @Claude.
// `at` is when it happened: normally the message's time, but Claude's status card is posted
// empty and only becomes an item once its run finishes.
export async function recordActivity(
  ctx: MutationCtx,
  m: Doc<"messages">,
  at = m._creationTime,
) {
  const { mentioned, inThread } = await involvement(ctx, m);
  const claude = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", CLAUDE_EMAIL))
    .unique();
  const skip = new Set<string>([m.authorId, ...(claude ? [claude._id] : [])]);
  for (const raw of new Set([...mentioned, ...inThread])) {
    const memberId = ctx.db.normalizeId("members", raw);
    if (!memberId || skip.has(memberId)) continue;
    await ctx.db.insert("activity", {
      memberId,
      messageId: m._id,
      kind: mentioned.has(raw) ? "mention" : "reply",
      at,
    });
  }
}

// Drops a deleted message's Activity items.
export async function forgetActivity(
  ctx: MutationCtx,
  messageId: Id<"messages">,
) {
  const rows = await ctx.db
    .query("activity")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .collect();
  for (const r of rows) await ctx.db.delete(r._id);
}
