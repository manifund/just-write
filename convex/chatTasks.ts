// Chat tasks: @Claude runs that read the club's data instead of changing code, to answer a
// question or post one message for the member who asked.
//
// A run is a chat task from the start (improvements.startFromMessage, lib/improve.ts
// isChatTask). app/api/improve/route.ts claims it with a run key (server.claimImprovement),
// reads `snapshot` and `messages` once, and writes them into a firewalled sandbox that has
// neither the server secret nor a GitHub token. The runner there (scripts/improve-runner.ts)
// reports steps through convex/runner.ts and its result through `finish`, both of which only
// accept that run's key while it's going. Convex stops the sandbox when the run ends
// (improvements.endRun → stopSandbox).
//
// The data is what any member can see in the portal: member cards, essays, chat, ideas,
// the calendar, and the improvements list. Never emails, payments, settings, or anything
// admin-only, and never the text of #check-ins posts, which are gated per member while
// a chat task's reply goes to everyone.
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { CHECK_IN_SLUG } from "./lib/channels";
import {
  CHAT_DRAFT_MAX_CHARS,
  CHAT_MENTION_LIMIT,
  CHAT_POSTS_PER_DAY,
  CHAT_POSTS_PER_MEMBER,
  CHAT_POST_CHANNELS,
  hashRunToken,
} from "./lib/improve";
import { markdownToDoc } from "./lib/markdown";
import { DEADLINES, PROGRAM_START, fillSlots } from "./lib/program";
import { cleanBody, type RichNode } from "./lib/richtext";
import { fmtDay, fmtTime } from "./lib/time";
import { ensureClaude } from "./improvements";
import { postMessage } from "./lib/messages";
import { applyReport, checkRunToken } from "./server";
import { canEnter, checkServerSecret, getViewer, isAdminEmail } from "./lib/viewer";

const pt = (ms: number) => `${fmtDay(ms)}, ${fmtTime(ms)} PT`;
const iso = (ms: number) => new Date(ms).toISOString();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ---------- Called by /api/improve (server secret) ----------

// The member who asked, if they can still use the portal.
async function requesterOf(ctx: QueryCtx, r: Doc<"improvements">) {
  const m = await ctx.db.get(r.requesterId);
  return m && !m.bot && canEnter(m, isAdminEmail(m.email)) ? m : null;
}

// The snapshot can only be read while the route sets the run up: with the run's token,
// before its sandbox exists.
async function settingUp(ctx: QueryCtx, id: Id<"improvements">, token: string) {
  const r = await ctx.db.get(id);
  if (
    !r ||
    r.kind !== "chat" ||
    r.status !== "running" ||
    !r.runTokenHash ||
    r.runTokenHash !== (await hashRunToken(token)) ||
    r.sandboxId
  )
    throw new ConvexError("That run isn’t a chat task being set up.");
  const requester = await requesterOf(ctx, r);
  if (!requester) throw new ConvexError("The person who asked can’t use the portal.");
  return { r, requester };
}

// Names by member id, read once each. Includes admins and Claude, who post but may not be
// committed; never anything but the name and handle.
function memberNames(ctx: QueryCtx) {
  const cache = new Map<Id<"members">, { name: string; handle: string | null } | null>();
  return async (id: Id<"members">) => {
    if (!cache.has(id)) {
      const m = await ctx.db.get(id);
      cache.set(id, m ? { name: m.name, handle: m.handle ?? null } : null);
    }
    return cache.get(id)!;
  };
}

// Everything but the messages, which are paged (`messages`).
export const snapshot = query({
  args: { secret: v.string(), id: v.id("improvements"), token: v.string() },
  handler: async (ctx, { secret, id, token }) => {
    checkServerSecret(secret);
    const { requester } = await settingUp(ctx, id, token);
    const now = Date.now();
    const names = memberNames(ctx);

    const channels = (await ctx.db.query("channels").collect()).sort(
      (a, b) => a.order - b.order,
    );
    const committed = (
      await ctx.db
        .query("members")
        .withIndex("by_status", (q) => q.eq("status", "committed"))
        .collect()
    ).filter((m) => !m.bot);

    // Like the progress board and profiles: rejected essays don't show.
    const essays = [];
    const byMember = new Map<Id<"members">, Doc<"essays">[]>();
    for (const e of await ctx.db.query("essays").collect())
      byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);
    for (const [memberId, list] of byMember) {
      const author = await names(memberId);
      if (!author) continue;
      const weekOf = new Map<string, number>();
      for (const s of fillSlots(list)) for (const eid of s.essayIds) weekOf.set(eid, s.week);
      for (const e of list) {
        if (e.review === "rejected") continue;
        essays.push({
          title: e.title,
          url: e.url,
          words: e.wordCount ?? null,
          submittedAt: iso(e.submittedAt),
          submittedPt: pt(e.submittedAt),
          author: author.name,
          handle: author.handle,
          week: weekOf.get(e._id) ?? null,
        });
      }
    }
    essays.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    const ideas = [];
    for (const i of await ctx.db.query("ideas").order("desc").take(300)) {
      const author = await names(i.memberId);
      if (!author) continue;
      const votes = await ctx.db
        .query("ideaVotes")
        .withIndex("by_idea", (q) => q.eq("ideaId", i._id))
        .collect();
      ideas.push({
        title: i.title,
        notes: i.notes ?? null,
        author: author.name,
        handle: author.handle,
        updatedAt: iso(i.updatedAt),
        votes: votes.length,
      });
    }

    const events = [];
    for (const e of await ctx.db.query("events").withIndex("by_start").collect()) {
      const rsvps = { yes: [] as string[], maybe: [] as string[], no: [] as string[] };
      for (const x of await ctx.db
        .query("rsvps")
        .withIndex("by_event", (q) => q.eq("eventId", e._id))
        .collect()) {
        const who = await names(x.memberId);
        if (who) rsvps[x.response].push(who.name);
      }
      const hosts = [];
      for (const h of [e.ownerId, ...e.cohostIds]) {
        const who = await names(h);
        if (who) hosts.push(who.name);
      }
      events.push({
        title: e.title,
        url: `https://justwrite.club/calendar/${e.slug ?? e._id}`,
        kind: e.kind ?? "session",
        description: e.description ?? null,
        start: iso(e.start),
        end: iso(e.end),
        when: `${pt(e.start)} to ${pt(e.end)}`,
        canceled: !!e.canceledAt,
        // Members see these in the portal; signed-out visitors don't.
        location: e.location ?? null,
        link: e.link ?? null,
        hosts,
        rsvps,
      });
    }

    // What /improvements shows (code runs only).
    // Runs asked for in #check-ins are left out too: their request is a check-in.
    const checkInsId = channels.find((c) => c.slug === CHECK_IN_SLUG)?._id;
    const improvements = [];
    for (const x of await ctx.db
      .query("improvements")
      .withIndex("by_number")
      .order("desc")
      .take(200)) {
      if (x.kind === "chat" || x.channelId === checkInsId) continue;
      improvements.push({
        number: x.number,
        status: x.status,
        request: x.request.slice(0, 500),
        title: x.title ?? null,
        summary: x.summary ?? null,
        requester: (await names(x.requesterId))?.name ?? null,
        at: iso(x._creationTime),
        prUrl: x.prUrl ?? null,
      });
    }

    return {
      about: {
        now: iso(now),
        nowPt: pt(now),
        askedBy: { name: requester.name, handle: requester.handle ?? null },
        programStart: iso(PROGRAM_START),
        deadlines: DEADLINES.map((d, i) => ({ week: i + 1, at: iso(d), pt: pt(d) })),
        channels: channels.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
        })),
      },
      members: committed
        .sort((a, b) => (a.committedAt ?? 0) - (b.committedAt ?? 0))
        .map((m) => ({
          name: m.name,
          handle: m.handle ?? null,
          bio: m.bio ?? null,
          link: m.link ?? null,
          committedAt: m.committedAt ? iso(m.committedAt) : null,
        })),
      essays,
      ideas,
      events,
      improvements,
    };
  },
});

// Every chat message, newest first (the route writes them oldest first). In #check-ins
// only the facts are kept (who, when, how long), never the text.
export const messages = query({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    token: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { secret, id, token, paginationOpts }) => {
    checkServerSecret(secret);
    await settingUp(ctx, id, token);
    const result = await ctx.db.query("messages").order("desc").paginate(paginationOpts);
    const channels = new Map(
      (await ctx.db.query("channels").collect()).map((c) => [c._id, c]),
    );
    const names = memberNames(ctx);

    const page = [];
    for (const m of result.page) {
      const channel = channels.get(m.channelId);
      if (!channel) continue;
      const author = await names(m.authorId);
      const reactions = new Map<string, string[]>();
      for (const x of await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", m._id))
        .collect()) {
        const who = (await names(x.memberId))?.name ?? "someone";
        reactions.set(x.emoji, [...(reactions.get(x.emoji) ?? []), who]);
      }
      const checkIn = channel.slug === CHECK_IN_SLUG;

      let text: string | null = m.text;
      let kind: string | null = m.kind ?? null;
      let essay = null;
      if (m.essayId) {
        kind = "essay";
        const e = await ctx.db.get(m.essayId);
        if (e) essay = { title: e.title, url: e.url, words: e.wordCount ?? null };
      } else if (m.eventId) kind = "event";
      else if (m.improvementId) {
        // Claude's reply card: the message is empty; the run has the text.
        kind = "claude-card";
        const run = await ctx.db.get(m.improvementId);
        text = run
          ? `[Run #${run.number}, ${run.kind === "chat" ? "chat task, " : ""}${run.status}] ${run.title ?? ""} ${run.summary ?? run.error ?? ""}`.trim()
          : "";
      } else if (m.postedFrom) kind = "claude-post";
      page.push({
        id: m._id,
        channel: channel.slug,
        thread: m.parentId ?? null,
        author: author?.name ?? "Someone",
        handle: author?.handle ?? null,
        at: iso(m._creationTime),
        pt: pt(m._creationTime),
        text: checkIn && !m.essayId ? null : text,
        words: words(m.text),
        replies: m.replyCount ?? 0,
        reactions: [...reactions].map(([emoji, by]) => ({ emoji, by })),
        edited: !!m.editedAt,
        kind,
        essay,
      });
    }
    return { ...result, page };
  },
});

// Stops a chat task's sandbox through the route's existing stop request (the sandbox has
// no credentials to do it itself). Scheduled by improvements.endRun, and by
// improvements.forceStop for a code run that didn't stop when asked.
export const stopSandbox = internalAction({
  args: { name: v.string() },
  handler: async (_ctx, { name }) => {
    if (!process.env.IMPROVE_URL) return;
    await fetch(process.env.IMPROVE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: process.env.CONVEX_SERVER_SECRET, stop: name }),
    }).catch((err) => console.error("chat task: couldn't stop sandbox", name, err));
  },
});

// ---------- Called by the runner in the sandbox (its run key) ----------
// Steps and the agent's session id go through convex/runner.ts#report, like code runs.

// The run's result. The key works once: endRun retires it, so nothing can be reported or
// posted after this. An `answered` result may carry one post: Claude posts it in its
// channel (with a line saying who asked) if that channel takes Claude's posts, the day's
// limits allow, and it only links to pages Claude can vouch for; otherwise it stays on the
// card as a draft for the member to send. A post that can't be used at all is dropped
// rather than failing the run.
export const finish = mutation({
  args: {
    id: v.id("improvements"),
    runToken: v.string(),
    outcome: v.union(v.literal("answered"), v.literal("failed")),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    post: v.optional(v.object({ channel: v.string(), markdown: v.string() })),
  },
  handler: async (ctx, { id, runToken, outcome, summary, error, post }) => {
    const r = await checkRunToken(ctx, id, runToken);
    if (r.kind !== "chat") throw new ConvexError("This run has ended.");
    if (outcome === "failed") {
      await applyReport(ctx, r, {
        fail: true,
        patch: { status: "failed", error: (error ?? "Something went wrong.").slice(0, 500) },
      });
      return;
    }
    let text = (summary ?? "").slice(0, 4000);
    const made = post ? await makeDraft(ctx, post) : null;
    let postId: Id<"messages"> | undefined;
    if (post && !made) text += "\n\n(I wrote a post, but it couldn’t be used.)";
    if (made) {
      const blocked =
        (await whyNotPost(ctx, r, made.channel)) ?? (await foreignLink(ctx, made.draft.body));
      if (blocked) text += `\n\n(I didn’t post this: ${blocked}. It’s below for you to send.)`;
      else
        postId = await postMessage(ctx, {
          channelId: made.channel._id,
          authorId: await ensureClaude(ctx),
          body: made.draft.body,
          text: made.text,
          postedFrom: r._id,
        });
    }
    await applyReport(ctx, r, {
      patch: {
        status: "answered",
        summary: text,
        ...(made ? { draft: made.draft } : {}),
        ...(postId ? { postId } : {}),
      },
    });
  },
});

// Why Claude shouldn't post in this channel now, or null if it can.
async function whyNotPost(ctx: MutationCtx, r: Doc<"improvements">, channel: Doc<"channels">) {
  if (!CHAT_POST_CHANNELS.includes(channel.slug))
    return `I don’t post in #${channel.slug}`;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const posted = (x: Doc<"improvements">) => !!x.postId && (x.finishedAt ?? 0) > since;
  const mine = await ctx.db
    .query("improvements")
    .withIndex("by_requester", (q) => q.eq("requesterId", r.requesterId))
    .collect();
  if (mine.filter(posted).length >= CHAT_POSTS_PER_MEMBER)
    return `I’ve posted ${CHAT_POSTS_PER_MEMBER} times for you today`;
  const recent = await ctx.db.query("improvements").withIndex("by_number").order("desc").take(300);
  if (recent.filter(posted).length >= CHAT_POSTS_PER_DAY)
    return "I’ve hit today’s limit on posts for the whole club";
  return null;
}

// Claude only posts links to this site and to the exact pages members registered as essays
// or put on their profiles, so text planted in the club's data can't get it to post a
// phishing link as itself. Anything else stays a draft for the asker to check and send.
// Returns why, or null.
async function foreignLink(ctx: MutationCtx, body: string) {
  const norm = (u: string) => u.trim().replace(/\/+$/, "");
  const known = new Set<string>();
  for (const e of await ctx.db.query("essays").collect()) known.add(norm(e.url));
  for (const m of await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "committed"))
    .collect())
    if (m.link) known.add(norm(m.link));
  const links: string[] = [];
  const walk = (n: RichNode) => {
    for (const mark of n.marks ?? [])
      if (mark.type === "link") links.push(String(mark.attrs?.href ?? ""));
    n.content?.forEach(walk);
  };
  walk(JSON.parse(body) as RichNode);
  const host = (l: string) => {
    try {
      return new URL(l).host;
    } catch {
      return null;
    }
  };
  const bad = links.find((l) => host(l) !== "justwrite.club" && !known.has(norm(l)));
  return bad === undefined ? null : `it links to ${host(bad) ?? "a page"}, which I can’t vouch for`;
}

// Converts the agent's markdown into chat's format. @handle mentions resolve to committed
// members (never Claude). Null if it's empty, too long, for #check-ins, or for a channel
// that doesn't exist.
async function makeDraft(
  ctx: MutationCtx,
  { channel, markdown }: { channel: string; markdown: string },
) {
  if (!markdown.trim() || markdown.length > CHAT_DRAFT_MAX_CHARS) return null;
  const c = await ctx.db
    .query("channels")
    .withIndex("by_slug", (q) => q.eq("slug", channel.replace(/^#/, "").toLowerCase()))
    .unique();
  // A check-in is the member's own writing, and posting one unlocks everyone else's.
  if (!c || c.slug === CHECK_IN_SLUG) return null;
  const handles = new Map<string, { id: string; label: string }>();
  for (const m of await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "committed"))
    .collect())
    if (m.handle && !m.bot) handles.set(m.handle, { id: m._id, label: m.name });
  try {
    const doc = markdownToDoc(markdown, (h) => handles.get(h) ?? null, CHAT_MENTION_LIMIT);
    const { body, text } = cleanBody(JSON.stringify(doc));
    return text ? { channel: c, text, draft: { channelId: c._id, markdown, body } } : null;
  } catch {
    return null;
  }
}

// ---------- Members ----------

// A chat task's post (or the draft it left), for its card (components/portal/improvement.tsx).
export const result = query({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.member || !canEnter(viewer.member, viewer.isAdmin)) return null;
    const r = await ctx.db.get(id);
    if (!r || r.kind !== "chat" || !r.draft) return null;
    const channel = await ctx.db.get(r.draft.channelId);
    if (!channel) return null;
    const post = r.postId ? await ctx.db.get(r.postId) : null;
    return {
      channelSlug: channel.slug,
      channelName: channel.name,
      body: r.draft.body,
      postId: post?._id ?? null,
      postRemoved: !!r.postId && !post,
    };
  },
});
