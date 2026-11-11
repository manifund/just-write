import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { publicMember, requireMember } from "./lib/viewer";

// /themes: a word cloud of everyone's essays and the themes Claude finds reading them.
// convex/themesAction.ts reads each essay's page once (essayTexts), then rebuilds the one
// `themes` row when the set of essays changes, at most once an hour.

const REFRESH_MS = 60 * 60 * 1000;
// How long the page says it's working on an update before assuming it failed.
const WORKING_MS = 15 * 60 * 1000;
// A page with no readable text is tried again after this long.
const RETRY_MS = 12 * 60 * 60 * 1000;

// Every registered essay that isn't rejected, oldest first, with its author.
async function counted(ctx: QueryCtx) {
  const essays = (await ctx.db.query("essays").collect())
    .filter((e) => e.review !== "rejected")
    .sort((a, b) => a.submittedAt - b.submittedAt);
  const authors = new Map<Id<"members">, Doc<"members"> | null>();
  for (const e of essays)
    if (!authors.has(e.memberId))
      authors.set(e.memberId, await ctx.db.get(e.memberId));
  return essays.flatMap((e) => {
    const author = authors.get(e.memberId);
    return author && !author.bot ? [{ essay: e, author }] : [];
  });
}

// Cheap fingerprint of which essays there are, so a new one triggers an update.
function hash(ids: string[]) {
  const s = [...ids].sort().join(",");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
    const essays = await counted(ctx);
    const byId = new Map(
      essays.map(({ essay, author }) => [
        essay._id as string,
        {
          _id: essay._id,
          title: essay.title,
          url: essay.url,
          author: publicMember(author),
        },
      ]),
    );
    const row = await ctx.db.query("themes").first();
    return {
      total: essays.length,
      read: row?.read ?? 0,
      cloud: row?.cloud ?? [],
      overview: row?.overview ?? null,
      themes: (row?.themes ?? [])
        .map((t) => ({
          name: t.name,
          summary: t.summary,
          essays: t.essayIds.flatMap((id) => byId.get(id) ?? []),
        }))
        .filter((t) => t.essays.length > 0),
      computedAt: row?.computedAt || null,
      stale:
        essays.length > 0 &&
        (!row || row.inputHash !== hash(essays.map((e) => e.essay._id))),
      working:
        !!row &&
        row.requestedAt > row.computedAt &&
        Date.now() - row.requestedAt < WORKING_MS,
    };
  },
});

// Asks for an update when there are new essays. At most once an hour, for everyone.
export const request = mutation({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
    const row = await ctx.db.query("themes").first();
    const now = Date.now();
    if (row && now - row.requestedAt < REFRESH_MS) return;
    const essays = await counted(ctx);
    if (essays.length === 0) return;
    if (row?.inputHash === hash(essays.map((e) => e.essay._id))) return;
    // Mark it requested first so concurrent requests don't schedule twice.
    if (row) await ctx.db.patch(row._id, { requestedAt: now });
    else
      await ctx.db.insert("themes", {
        cloud: [],
        themes: [],
        read: 0,
        inputHash: "",
        computedAt: 0,
        requestedAt: now,
      });
    await ctx.scheduler.runAfter(0, internal.themesAction.compute, {});
  },
});

// Essays whose page hasn't been read yet, or had no readable text a while ago.
export const toFetch = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const out: { essayId: Id<"essays">; url: string }[] = [];
    for (const { essay } of await counted(ctx)) {
      const row = await ctx.db
        .query("essayTexts")
        .withIndex("by_essay", (q) => q.eq("essayId", essay._id))
        .unique();
      if (!row || (!row.text && now - row.fetchedAt > RETRY_MS))
        out.push({ essayId: essay._id, url: essay.url });
    }
    return out;
  },
});

export const saveText = internalMutation({
  args: {
    essayId: v.id("essays"),
    url: v.string(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("essayTexts")
      .withIndex("by_essay", (q) => q.eq("essayId", args.essayId))
      .unique();
    const doc = { ...args, fetchedAt: Date.now() };
    if (row) await ctx.db.replace(row._id, doc);
    else await ctx.db.insert("essayTexts", doc);
  },
});

// What the cloud and themes are made from, plus text saved for essays that were deleted.
export const inputs = internalQuery({
  args: {},
  handler: async (ctx) => {
    const essays = await counted(ctx);
    const texts = await ctx.db.query("essayTexts").collect();
    const textOf = new Map(texts.map((t) => [t.essayId as string, t.text]));
    const orphans: Id<"essayTexts">[] = [];
    for (const t of texts)
      if (!(await ctx.db.get(t.essayId))) orphans.push(t._id);
    const row = await ctx.db.query("themes").first();
    return {
      hash: hash(essays.map((e) => e.essay._id)),
      previousHash: row?.inputHash ?? null,
      orphans,
      essays: essays.map(({ essay, author }) => ({
        id: essay._id,
        title: essay.title,
        author: author.name,
        authorId: author._id,
        text: textOf.get(essay._id) ?? null,
      })),
    };
  },
});

const cloudWord = v.object({
  word: v.string(),
  weight: v.number(),
  uses: v.number(),
  essays: v.number(),
});

// Saves a fresh cloud. Themes and inputHash are only replaced when given, so a failed
// model call keeps the old themes and the next request tries again.
export const save = internalMutation({
  args: {
    cloud: v.array(cloudWord),
    read: v.number(),
    orphans: v.array(v.id("essayTexts")),
    themes: v.optional(
      v.object({
        overview: v.optional(v.string()),
        themes: v.array(
          v.object({
            name: v.string(),
            summary: v.string(),
            essayIds: v.array(v.id("essays")),
          }),
        ),
        summaries: v.optional(
          v.array(v.object({ essayId: v.id("essays"), summary: v.string() })),
        ),
        inputHash: v.string(),
      }),
    ),
  },
  handler: async (ctx, { cloud, read, orphans, themes }) => {
    for (const id of orphans) if (await ctx.db.get(id)) await ctx.db.delete(id);
    const row = await ctx.db.query("themes").first();
    const now = Date.now();
    const doc = {
      cloud,
      read,
      computedAt: now,
      ...(themes ?? {}),
    };
    if (row) await ctx.db.patch(row._id, doc);
    else
      await ctx.db.insert("themes", {
        themes: [],
        inputHash: "",
        requestedAt: now,
        ...doc,
      });
  },
});
