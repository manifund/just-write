import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { emptyDoc } from "./lib/richtext";
import { fillSlots } from "./lib/program";
import { parseWebsite } from "./lib/util";
import { publicMember, requireMember } from "./lib/viewer";

// Fetches an essay URL to suggest a title and estimate its word count.
export const preview = action({
  args: { url: v.string() },
  handler: async (_ctx, args) => {
    const url = parseWebsite(args.url);
    if (!url) return { url: null, title: null, wordCount: null };
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JustWriteBot/1.0; +https://justwrite.club)" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { url, title: null, wordCount: null };
      const html = (await res.text()).slice(0, 2_000_000);
      return { url, title: extractTitle(html), wordCount: countWords(html) };
    } catch {
      return { url, title: null, wordCount: null };
    }
  },
});

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ")
    .trim();
}

function extractTitle(html: string) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const t = og?.[1] ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return t ? decode(t).slice(0, 200) || null : null;
}

// Rough word count of the main text: prefers <article>, ignores scripts, styles, and nav chrome.
function countWords(html: string) {
  const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const text = body
    .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const words = decode(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  const n = words?.length ?? 0;
  return n >= 50 ? n : null;
}

export const submit = mutation({
  args: { url: v.string(), title: v.string(), wordCount: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const url = parseWebsite(args.url);
    if (!url) throw new ConvexError("That link doesn’t look right.");
    const title = args.title.trim().slice(0, 200);
    if (!title) throw new ConvexError("Please add a title.");

    const dupe = await ctx.db
      .query("essays")
      .withIndex("by_url", (q) => q.eq("url", url))
      .first();
    if (dupe) throw new ConvexError("That essay is already registered.");

    const essayId = await ctx.db.insert("essays", {
      memberId: member._id,
      url,
      title,
      wordCount: args.wordCount ?? undefined,
      submittedAt: Date.now(),
      review: "pending",
    });

    // Announce it in #published, where people can react and reply.
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", "published"))
      .unique();
    if (channel) {
      await ctx.db.insert("messages", {
        channelId: channel._id,
        authorId: member._id,
        body: JSON.stringify(emptyDoc),
        text: `published “${title}”`,
        essayId,
      });
    }
    return essayId;
  },
});

export const remove = mutation({
  args: { essayId: v.id("essays") },
  handler: async (ctx, { essayId }) => {
    const { member } = await requireMember(ctx);
    const essay = await ctx.db.get(essayId);
    if (!essay || essay.memberId !== member._id) throw new ConvexError("Not your essay.");
    await ctx.db.delete(essayId);
    // Remove the #published announcement (and its replies and reactions) too.
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", "published"))
      .unique();
    if (!channel) return;
    const posts = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) => q.eq("channelId", channel._id).eq("parentId", undefined))
      .filter((q) => q.eq(q.field("essayId"), essayId))
      .collect();
    for (const p of posts) {
      const replies = await ctx.db.query("messages").withIndex("by_parent", (q) => q.eq("parentId", p._id)).collect();
      for (const m of [p, ...replies]) {
        const reacts = await ctx.db.query("reactions").withIndex("by_message", (q) => q.eq("messageId", m._id)).collect();
        for (const r of reacts) await ctx.db.delete(r._id);
        await ctx.db.delete(m._id);
      }
    }
  },
});

// The viewer's essays and how they fill the 4 weekly slots.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    const essays = (
      await ctx.db
        .query("essays")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect()
    ).sort((a, b) => b.submittedAt - a.submittedAt);
    return { essays, slots: fillSlots(essays) };
  },
});

// Everyone's progress, for the progress board on the home page.
export const board = query({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
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
        const byId = new Map(essays.map((e) => [e._id as string, e]));
        return {
          member: publicMember(m),
          slots: fillSlots(essays).map((s) => {
            const e = s.essayId ? byId.get(s.essayId) : undefined;
            return { week: s.week, essay: e ? { title: e.title, url: e.url } : null };
          }),
        };
      }),
    );
  },
});

// Latest essays from everyone, newest first.
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("essays").order("desc").take(Math.min(limit ?? 12, 50));
    const out = await Promise.all(
      rows
        .filter((e) => e.review !== "rejected")
        .map(async (e) => {
          const m = await ctx.db.get(e.memberId);
          return m
            ? {
                _id: e._id,
                title: e.title,
                url: e.url,
                wordCount: e.wordCount ?? null,
                submittedAt: e.submittedAt,
                author: publicMember(m),
              }
            : null;
        }),
    );
    return out.filter((e) => e !== null);
  },
});
