// @Claude site improvements. A member mentions Claude in chat; chat.send calls
// startFromMessage, which records a run, posts Claude's status card in the thread, and
// asks the Next.js route /api/improve to start a Vercel Sandbox. The runner inside it
// (scripts/improve-runner.ts) reports progress back through server.reportImprovement.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  CLAUDE_EMAIL,
  GLOBAL_DAILY_LIMIT,
  MEMBER_DAILY_LIMIT,
  branchFor,
} from "./lib/improve";
import { postMessage } from "./lib/messages";
import { emptyDoc, type RichNode } from "./lib/richtext";
import { publicMember, requireAdmin } from "./lib/viewer";

const DAY = 24 * 60 * 60 * 1000;

export async function getClaude(ctx: QueryCtx) {
  return await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", CLAUDE_EMAIL))
    .unique();
}

export async function ensureClaude(ctx: MutationCtx) {
  const existing = await getClaude(ctx);
  if (existing) return existing._id;
  return await ctx.db.insert("members", {
    name: "Claude",
    email: CLAUDE_EMAIL,
    status: "interested",
    handle: "claude",
    image: "/claude.svg",
    bio: "Mention @Claude in chat to ask for a change to this site.",
    bot: true,
  });
}

// Posts a message as Claude. Replies bump the thread's reply count like any other reply.
export async function postAsClaude(
  ctx: MutationCtx,
  args: {
    channelId: Id<"channels">;
    parentId?: Id<"messages">;
    body: RichNode;
    improvementId?: Id<"improvements">;
  },
) {
  const claudeId = await ensureClaude(ctx);
  if (args.parentId) {
    const parent = await ctx.db.get(args.parentId);
    if (parent)
      await ctx.db.patch(parent._id, {
        replyCount: (parent.replyCount ?? 0) + 1,
        lastReplyAt: Date.now(),
        replierIds: [
          claudeId,
          ...(parent.replierIds ?? []).filter((id) => id !== claudeId),
        ].slice(0, 3),
      });
  }
  return await postMessage(ctx, {
    channelId: args.channelId,
    authorId: claudeId,
    body: JSON.stringify(args.body),
    text: plainOf(args.body),
    parentId: args.parentId,
    improvementId: args.improvementId,
  });
}

function plainOf(n: RichNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "mention") return `@${n.attrs?.label ?? ""}`;
  return (n.content ?? []).map(plainOf).join(n.type === "doc" ? "\n" : "");
}

export function paragraph(...content: RichNode[]): RichNode {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}
export const txt = (text: string, href?: string): RichNode =>
  href
    ? { type: "text", text, marks: [{ type: "link", attrs: { href } }] }
    : { type: "text", text };
export const mention = (m: Doc<"members">): RichNode => ({
  type: "mention",
  attrs: { id: m._id, label: m.name },
});

// Called from chat.send when a message mentions Claude.
export async function startFromMessage(
  ctx: MutationCtx,
  args: {
    member: Doc<"members">;
    isAdmin: boolean;
    channelId: Id<"channels">;
    messageId: Id<"messages">;
    parentId?: Id<"messages">;
    text: string;
  },
) {
  const threadId = args.parentId ?? args.messageId;
  const reply = (text: string) =>
    postAsClaude(ctx, {
      channelId: args.channelId,
      parentId: threadId,
      body: paragraph(mention(args.member), txt(` ${text}`)),
    });

  if (!process.env.IMPROVE_URL)
    return await reply(
      "I’m not switched on for this site yet. Austin is setting me up.",
    );

  const since = Date.now() - DAY;
  const recent = await ctx.db
    .query("improvements")
    .withIndex("by_number")
    .order("desc")
    .take(GLOBAL_DAILY_LIMIT + 1);
  const today = recent.filter((r) => r._creationTime > since);
  if (!args.isAdmin) {
    const mine = today.filter((r) => r.requesterId === args.member._id);
    if (mine.length >= MEMBER_DAILY_LIMIT)
      return await reply(
        `You’ve asked for ${MEMBER_DAILY_LIMIT} changes in the last day, which is the limit for now. Try again tomorrow.`,
      );
    if (today.length >= GLOBAL_DAILY_LIMIT)
      return await reply(
        "I’ve hit today’s limit for the whole club. Try again tomorrow.",
      );
  }

  // A follow-up in a thread continues the earlier run's open PR.
  const previous = await ctx.db
    .query("improvements")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first();
  if (previous && (previous.status === "queued" || previous.status === "running"))
    return await reply(
      "I’m still working on the request above. Ask again here once it’s done and I’ll build on it.",
    );
  const continues = previous?.status === "pr" ? previous : null;

  const number = (recent[0]?.number ?? 0) + 1;
  const id = await ctx.db.insert("improvements", {
    number,
    requesterId: args.member._id,
    channelId: args.channelId,
    threadId,
    requestMessageId: args.messageId,
    request: args.text.slice(0, 8000),
    status: "queued",
    steps: [{ label: "Starting a sandbox", state: "active" }],
    branch: continues?.branch ?? branchFor(number),
    previousId: continues?._id,
    prNumber: continues?.prNumber,
    prUrl: continues?.prUrl,
  });
  const replyMessageId = await postAsClaude(ctx, {
    channelId: args.channelId,
    parentId: threadId,
    body: emptyDoc,
    improvementId: id,
  });
  await ctx.db.patch(id, { replyMessageId });
  await ctx.scheduler.runAfter(0, internal.improvements.kick, { id });
  return replyMessageId;
}

// Asks Next.js to start the sandbox. The route returns once the runner is going.
export const kick = internalAction({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    let error: string | null = null;
    try {
      const res = await fetch(process.env.IMPROVE_URL!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: process.env.CONVEX_SERVER_SECRET, id }),
      });
      if (!res.ok) error = `${res.status} ${(await res.text()).slice(0, 300)}`;
    } catch (err) {
      error = String(err);
    }
    if (error) {
      console.error("improve kick failed", id, error);
      await ctx.runMutation(internal.improvements.markFailed, {
        id,
        error: "Couldn’t start a sandbox.",
      });
    }
  },
});

export const markFailed = internalMutation({
  args: { id: v.id("improvements"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const r = await ctx.db.get(id);
    if (!r || (r.status !== "queued" && r.status !== "running")) return;
    await ctx.db.patch(id, {
      status: "failed",
      error,
      finishedAt: Date.now(),
      steps: r.steps.map((s) =>
        s.state === "active" ? { ...s, state: "failed" as const } : s,
      ),
    });
  },
});

// Runs that never reported back (the sandbox died or timed out) are marked failed.
export const reapStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 45 * 60 * 1000;
    const rows = await ctx.db
      .query("improvements")
      .withIndex("by_number")
      .order("desc")
      .take(50);
    for (const r of rows)
      if (
        (r.status === "queued" || r.status === "running") &&
        (r.startedAt ?? r._creationTime) < cutoff
      )
        await ctx.db.patch(r._id, {
          status: "failed",
          error: "The sandbox stopped before finishing.",
          finishedAt: Date.now(),
          steps: r.steps.map((s) =>
            s.state === "active" ? { ...s, state: "failed" as const } : s,
          ),
        });
  },
});

// The fields a status card needs. Shared by chat (hydrate) and /improvements.
export function cardOf(r: Doc<"improvements">) {
  return {
    _id: r._id,
    number: r.number,
    status: r.status,
    steps: r.steps,
    branch: r.branch,
    title: r.title ?? null,
    summary: r.summary ?? null,
    files: r.files ?? [],
    checksPassed: r.checksPassed ?? null,
    touchesConvex: r.touchesConvex ?? false,
    verdict: r.verdict ?? null,
    prNumber: r.prNumber ?? null,
    prUrl: r.prUrl ?? null,
    previewUrl: r.previewUrl ?? null,
    revertPrUrl: r.revertPrUrl ?? null,
    error: r.error ?? null,
    startedAt: r.startedAt ?? null,
    finishedAt: r.finishedAt ?? null,
  };
}
export type ImprovementCard = ReturnType<typeof cardOf>;

// /improvements: every run, newest first. Public, like the members directory.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("improvements")
      .withIndex("by_number")
      .order("desc")
      .take(200);
    const channels = new Map(
      (await ctx.db.query("channels").collect()).map((c) => [c._id, c.slug]),
    );
    return await Promise.all(
      rows.map(async (r) => {
        const requester = await ctx.db.get(r.requesterId);
        return {
          ...cardOf(r),
          createdAt: r._creationTime,
          request: r.request,
          requester: requester ? publicMember(requester) : null,
          threadHref: `/chat/${channels.get(r.channelId) ?? "general"}/${r.threadId}`,
        };
      }),
    );
  },
});

// What the admin Merge / Close / Revert actions need (app/improvements/actions.ts).
export const forAdmin = query({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    const viewer = await requireAdmin(ctx);
    // A query, but it gates the Merge/Close/Revert actions, so read-only sessions can't use it.
    if (viewer.readonly)
      throw new ConvexError("This is a read-only preview, so changes aren’t saved.");
    const r = await ctx.db.get(id);
    if (!r) return null;
    return {
      status: r.status,
      branch: r.branch,
      prNumber: r.prNumber ?? null,
      revertPrUrl: r.revertPrUrl ?? null,
      adminId: viewer.member?._id ?? null,
    };
  },
});
