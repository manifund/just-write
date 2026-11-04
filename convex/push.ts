// Push notifications for chat. Browsers subscribe from /settings (lib/push.ts); each new
// message schedules pushAction.notify, which asks `recipients` who should hear about it.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { checkInGate, unreadCounts, veil } from "./chat";
import { channelRoom, notificationTag } from "./lib/channels";
import { pushEndpoint } from "./lib/pushEndpoint";
import { mentionIds, type RichNode } from "./lib/richtext";
import { canEnter, isAdminEmail, requireMember } from "./lib/viewer";
import { presence } from "./presence";
import { notifyLevel } from "./schema";

// The key browsers subscribe with, or null if push isn't set up on this deployment.
export const publicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

// Saves this browser's subscription for the viewer. The portal calls it again on every
// visit (PortalFrame), so a browser that someone else signs in on moves to their account.
export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const endpoint = pushEndpoint(args.endpoint);
    if (!endpoint)
      throw new ConvexError("This browser’s push service isn’t supported.");
    // base64url keys: a 65-byte P-256 public key and a 16-byte secret.
    if (
      !/^[\w-]{87}=?$/.test(args.p256dh) ||
      !/^[\w-]{22}(==)?$/.test(args.auth)
    )
      throw new ConvexError("That push subscription doesn’t look right.");
    const row = { ...args, endpoint, memberId: member._id };
    const existing = await bySubscription(ctx, endpoint);
    if (
      existing?.memberId === row.memberId &&
      existing.p256dh === row.p256dh &&
      existing.auth === row.auth
    )
      return; // the portal re-saves on every visit; usually nothing changed
    // Re-inserted rather than patched, so the cap below drops the devices that changed longest ago.
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("pushSubscriptions", row);
    // Keep the newest few, so stale devices don't pile up (oldest first by index order).
    const mine = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    for (const old of mine.slice(0, -MAX_DEVICES)) await ctx.db.delete(old._id);
  },
});

const MAX_DEVICES = 10;

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const { member } = await requireMember(ctx);
    const normal = pushEndpoint(endpoint);
    const existing = normal && (await bySubscription(ctx, normal));
    if (existing && existing.memberId === member._id)
      await ctx.db.delete(existing._id);
  },
});

export const setLevel = mutation({
  args: { notify: notifyLevel },
  handler: async (ctx, { notify }) => {
    const { member } = await requireMember(ctx);
    await ctx.db.patch(member._id, { notify });
  },
});

async function bySubscription(ctx: MutationCtx, endpoint: string) {
  return await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
    .unique();
}

// Who should be notified about a new message, and what the notification says.
// Mentioned members and everyone in the thread are; members who chose "all" also hear
// about every new top-level post. Nobody hears about their own messages, or about a
// channel they have open right now.
export const recipients = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    const channel = m && (await ctx.db.get(m.channelId));
    const author = m && (await ctx.db.get(m.authorId));
    // No text means nothing to show yet, like the status card @Claude fills in as it works.
    if (!m || !channel || !author || !m.text) return null;

    const direct = new Set<string>(mentionIds(JSON.parse(m.body) as RichNode));
    if (m.parentId) {
      const parent = await ctx.db.get(m.parentId);
      if (parent) direct.add(parent.authorId);
      const replies = await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", m.parentId))
        .collect();
      for (const r of replies) direct.add(r.authorId);
    }
    const watching = new Set(
      (await presence.listRoom(ctx, channelRoom(channel.slug), true)).map(
        (p) => p.userId,
      ),
    );

    const byMember = new Map<Id<"members">, Doc<"pushSubscriptions">[]>();
    for (const s of await ctx.db.query("pushSubscriptions").collect())
      byMember.set(s.memberId, [...(byMember.get(s.memberId) ?? []), s]);

    const targets: [Doc<"members">, Doc<"pushSubscriptions">[]][] = [];
    for (const [memberId, subs] of byMember) {
      if (memberId === m.authorId || watching.has(memberId)) continue;
      const member = await ctx.db.get(memberId);
      if (!member) continue;
      const admin = [member.email, member.altEmail].some(
        (e) => e && isAdminEmail(e),
      );
      if (!canEnter(member, admin)) continue;
      const wants =
        direct.has(memberId) || (member.notify === "all" && !m.parentId);
      if (wants) targets.push([member, subs]);
    }
    const badges = await unreadCounts(
      ctx,
      targets.map(([member]) => member._id),
    );

    // Essay, event, and "joined" posts read as a sentence after the author's name.
    const sentence = m.essayId || m.eventId || m.kind;
    return {
      notification: {
        title: clip(
          `${author.name} ${m.parentId ? "replied in" : "in"} #${channel.name}`,
          120,
        ),
        url: `/chat/${channel.slug}${m.parentId ? `?thread=${m.parentId}` : ""}`,
        tag: notificationTag(channel.slug, m.parentId),
      },
      recipients: await Promise.all(
        targets.map(async ([member, subscriptions]) => {
          // Same text they'd see in the app: #check-ins stays hidden behind its gate.
          const { text } = veil(m, await checkInGate(ctx, channel, member));
          return {
            subscriptions,
            badge: badges.get(member._id) ?? 0,
            body: clip(sentence ? `${author.name} ${text}` : text, 300),
          };
        }),
      ),
    };
  },
});

// Keeps notifications well under the ~4KB push payload limit.
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

// Drops subscriptions the push service says are gone.
export const forget = internalMutation({
  args: { ids: v.array(v.id("pushSubscriptions")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
