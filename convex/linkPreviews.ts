import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { essayExtras, themesRow } from "./lib/essayCard";
import {
  MAX_LINK_PREVIEWS,
  messageUrls,
  parseMeta,
  previewableUrl,
} from "./lib/linkMeta";
import { requireMember } from "./lib/viewer";

// Preview cards for links in chat: the page's title, description, and image from its
// Open Graph tags, fetched once per URL and kept in `linkPreviews`. Links to registered
// essays also get the essay's themes and summary from /themes.

const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 24 * 60 * 60 * 1000;
// A fetch that hasn't saved by then is assumed lost and can be asked for again.
const PENDING_MS = 10 * 60 * 1000;

function needsFetch(row: Doc<"linkPreviews"> | null, now: number) {
  if (!row) return true;
  const age = now - row.fetchedAt;
  if (row.ok === undefined) return age > PENDING_MS;
  return age > (row.ok ? REFRESH_MS : RETRY_MS);
}

async function rowFor(ctx: QueryCtx, url: string) {
  return await ctx.db
    .query("linkPreviews")
    .withIndex("by_url", (q) => q.eq("url", url))
    .unique();
}

export const get = query({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireMember(ctx);
    const now = Date.now();
    let themes: Doc<"themes"> | null | undefined;
    const out = [];
    for (const raw of args.urls.slice(0, MAX_LINK_PREVIEWS)) {
      const url = previewableUrl(raw);
      if (!url) continue;
      const row = await rowFor(ctx, url);
      const essay =
        (await ctx.db
          .query("essays")
          .withIndex("by_url", (q) => q.eq("url", raw))
          .first()) ??
        (url === raw
          ? null
          : await ctx.db
              .query("essays")
              .withIndex("by_url", (q) => q.eq("url", url))
              .first());
      let essayInfo = null;
      if (essay && essay.review !== "rejected") {
        if (themes === undefined) themes = await themesRow(ctx);
        essayInfo = {
          title: essay.title,
          authorId: essay.memberId,
          wordCount: essay.wordCount ?? null,
          ...essayExtras(themes, essay._id),
        };
      }
      out.push({
        url: raw,
        needsFetch: needsFetch(row, now),
        card: row?.ok
          ? {
              title: row.title ?? null,
              description: row.description ?? null,
              image: row.image ?? null,
              siteName: row.siteName ?? null,
            }
          : null,
        essay: essayInfo,
      });
    }
    return out;
  },
});

// Asks for cards for a message's links (and its essay's page) that haven't been read yet.
// Only URLs in real messages are fetched, so this can't be used to fetch arbitrary pages.
export const request = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    await requireMember(ctx, { allowReadonly: true });
    const m = await ctx.db.get(args.messageId);
    if (!m) return;
    const urls = messageUrls(m.body);
    if (m.essayId) {
      const essay = await ctx.db.get(m.essayId);
      const url = essay && previewableUrl(essay.url);
      if (url && !urls.includes(url)) urls.unshift(url);
    }
    const now = Date.now();
    for (const url of urls.slice(0, MAX_LINK_PREVIEWS)) {
      const row = await rowFor(ctx, url);
      if (!needsFetch(row, now)) continue;
      // Marks it asked for first, so other viewers don't schedule it again.
      if (row) await ctx.db.patch(row._id, { fetchedAt: now });
      else await ctx.db.insert("linkPreviews", { url, fetchedAt: now });
      await ctx.scheduler.runAfter(0, internal.linkPreviews.fetchCard, { url });
    }
  },
});

const UA =
  "Mozilla/5.0 (compatible; JustWriteBot/1.0; +https://justwrite.club) facebookexternalhit/1.1";
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;

export const fetchCard = internalAction({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    let meta = null;
    try {
      meta = await readCard(url);
    } catch {
      meta = null;
    }
    await ctx.runMutation(internal.linkPreviews.save, {
      url,
      ok: !!meta && !!(meta.title || meta.description || meta.image),
      ...(meta ?? {}),
    });
  },
});

// Follows redirects by hand so each hop is checked against previewableUrl.
async function readCard(start: string) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        const safe = next && previewableUrl(new URL(next, url).toString());
        if (!safe) return null;
        url = safe;
        continue;
      }
      if (!res.ok || !res.body) return null;
      const type = res.headers.get("content-type") ?? "";
      if (type.startsWith("image/") && /^https:/i.test(url)) {
        await res.body.cancel();
        return { image: url };
      }
      if (!type.includes("html")) {
        await res.body.cancel();
        return null;
      }
      return parseMeta(await readSome(res.body), url);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// The start of a page, enough for its <head>.
async function readSome(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    text += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(text)) break;
  }
  await reader.cancel().catch(() => {});
  return text;
}

export const save = internalMutation({
  args: {
    url: v.string(),
    ok: v.boolean(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.string()),
    siteName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await rowFor(ctx, args.url);
    const doc = { ...args, fetchedAt: Date.now() };
    // A failed refresh keeps the card it had.
    if (row?.ok && !args.ok)
      await ctx.db.patch(row._id, { fetchedAt: doc.fetchedAt });
    else if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("linkPreviews", doc);
  },
});
