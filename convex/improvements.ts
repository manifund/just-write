// @Claude site improvements. A member mentions Claude in chat; chat.send calls
// startFromMessage, which records a run, posts Claude's status card in the thread, and
// asks the Next.js route /api/improve to start a Vercel Sandbox. The runner inside it
// (scripts/improve-runner.ts) reports progress back through server.reportImprovement.
import type { WithoutSystemFields } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  CLAUDE_EMAIL,
  GLOBAL_DAILY_LIMIT,
  MEMBER_DAILY_LIMIT,
  branchFor,
  isChatTask,
} from "./lib/improve";
import { recordActivity } from "./lib/activity";
import { getClaude } from "./lib/claude";
import { postMessage } from "./lib/messages";
import { emptyDoc, type RichNode } from "./lib/richtext";
import { publicMember, requireAdmin, requireMember } from "./lib/viewer";

const DAY = 24 * 60 * 60 * 1000;

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
    // A run that continues this run's PR from the start (server.fixConflicts), skipping
    // the route's choice of target. Like every run on a PR, it merges main in first.
    continues?: Doc<"improvements">;
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

  // A chat task reads the club's data instead of changing code (convex/chatTasks.ts).
  // Decided here, once, so a run can't change kind later.
  const earlier = await ctx.db
    .query("improvements")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .collect();
  const kind = args.continues
    ? undefined
    : isChatTask(
    args.text,
    earlier.map((r) => r.kind),
  )
    ? ("chat" as const)
    : undefined;

  // Whether this continues one of the thread's open PRs or starts a new one is decided
  // when the run starts (app/api/improve/route.ts, lib/improve-target.ts), from what was asked.
  // If the thread's latest run of the same kind is still going, this one waits. The runner
  // hands it to the agent mid-run (runner.followUps; code runs only); otherwise it starts
  // when that run ends (releaseWaiting). Chat tasks and code runs share nothing, so neither
  // waits for the other.
  const busy =
    earlier.find(
      (r) =>
        r.kind === kind && (r.status === "queued" || r.status === "running"),
    ) ?? null;

  const number = (recent[0]?.number ?? 0) + 1;
  const id = await ctx.db.insert("improvements", {
    number,
    kind,
    requesterId: args.member._id,
    channelId: args.channelId,
    threadId,
    requestMessageId: args.messageId,
    request: args.text.slice(0, 8000),
    status: "queued",
    steps: [
      {
        label: busy
          ? "Waiting for the request above to finish"
          : "Getting started",
        state: "active",
      },
    ],
    waitingOn: busy?._id,
    branch: args.continues?.branch ?? branchFor(number),
    ...(args.continues && {
      previousId: args.continues._id,
      prNumber: args.continues.prNumber,
      prUrl: args.continues.prUrl,
    }),
  });
  const replyMessageId = await postAsClaude(ctx, {
    channelId: args.channelId,
    parentId: threadId,
    body: emptyDoc,
    improvementId: id,
  });
  await ctx.db.patch(id, { replyMessageId });
  if (!busy)
    await ctx.scheduler.runAfter(0, internal.improvements.kick, { id });
  return replyMessageId;
}

// Called when a run ends (any final status). Starts the follow-up that was waiting on it.
// The kick is delayed so the finished run's sandbox, which the follow-up may reuse, has time
// to stop first.
export async function releaseWaiting(
  ctx: MutationCtx,
  finished: Doc<"improvements">,
) {
  const waiters = await ctx.db
    .query("improvements")
    .withIndex("by_thread", (q) => q.eq("threadId", finished.threadId))
    .collect();
  for (const w of waiters) {
    if (w.waitingOn !== finished._id || w.status !== "queued") continue;
    await ctx.db.patch(w._id, {
      waitingOn: undefined,
      steps: [
        ...w.steps.map((s) =>
          s.state === "active" ? { ...s, state: "done" as const } : s,
        ),
        { label: "Getting started", state: "active" as const },
      ],
    });
    // No sandbox to wait for after a chat task: each one gets a throwaway sandbox.
    const delay = finished.kind === "chat" ? 1000 : 60_000;
    await ctx.scheduler.runAfter(delay, internal.improvements.kick, {
      id: w._id,
    });
  }
}

// Asks Next.js to start the sandbox. The route returns once the runner is going, and
// retries sandbox startup itself. If the request doesn't get through at all, try again a
// couple of times; the route skips runs it has already claimed, so a repeat is harmless.
const KICK_ATTEMPTS = 3;

export const kick = internalAction({
  args: { id: v.id("improvements"), attempt: v.optional(v.number()) },
  handler: async (ctx, { id, attempt = 1 }) => {
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
      console.error(`improve kick failed (attempt ${attempt})`, id, error);
      if (attempt < KICK_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          30_000 * attempt,
          internal.improvements.kick,
          {
            id,
            attempt: attempt + 1,
          },
        );
        return;
      }
      await ctx.runMutation(internal.improvements.markFailed, {
        id,
        error: "Couldn’t start a sandbox.",
      });
    }
  },
});

// Gives a run its final fields. The first time it ends, that also sets finishedAt and makes
// Claude's reply card an Activity item for the thread's members (it was posted empty, so
// postMessage didn't). Callers release any waiting follow-up themselves.
export async function endRun(
  ctx: MutationCtx,
  r: Doc<"improvements">,
  patch: Partial<WithoutSystemFields<Doc<"improvements">>>,
) {
  const first = !r.finishedAt;
  await ctx.db.patch(r._id, {
    ...patch,
    runTokenHash: undefined, // the sandbox's key stops working
    ...(first ? { finishedAt: Date.now() } : {}),
  });
  if (!first) return;
  const after = { ...r, ...patch };
  // A chat task's runner can't reach /api/improve (its firewall), so stop its sandbox here.
  if (r.kind === "chat" && after.sandboxId)
    await ctx.scheduler.runAfter(5000, internal.chatTasks.stopSandbox, {
      name: after.sandboxId,
    });
  const reply = r.replyMessageId && (await ctx.db.get(r.replyMessageId));
  if (reply && (after.summary || after.error))
    await recordActivity(ctx, reply, Date.now());
}

async function failRun(
  ctx: MutationCtx,
  r: Doc<"improvements">,
  error: string,
) {
  await endRun(ctx, r, {
    status: "failed",
    error,
    steps: r.steps.map((s) =>
      s.state === "active" ? { ...s, state: "failed" as const } : s,
    ),
  });
  await releaseWaiting(ctx, { ...r, status: "failed" });
}

export const markFailed = internalMutation({
  args: { id: v.id("improvements"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const r = await ctx.db.get(id);
    if (!r || (r.status !== "queued" && r.status !== "running")) return;
    await failRun(ctx, r, error);
  },
});

// Runs that never reported back (the sandbox died or timed out) are marked failed.
export const reapStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Chat tasks' sandboxes stop after 25 minutes; code runs' after 40.
    const cutoff = (r: Doc<"improvements">) =>
      Date.now() - (r.kind === "chat" ? 30 : 45) * 60 * 1000;
    const rows = await ctx.db
      .query("improvements")
      .withIndex("by_number")
      .order("desc")
      .take(50);
    for (const r of rows)
      if (
        (r.status === "queued" || r.status === "running") &&
        !r.waitingOn && // waiting its turn, not stuck
        (r.startedAt ?? r._creationTime) < cutoff(r)
      )
        await failRun(ctx, r, "The sandbox stopped before finishing.");
  },
});

// The fields a status card needs. Shared by the card in chat and /improvements.
export function cardOf(r: Doc<"improvements">) {
  return {
    _id: r._id,
    number: r.number,
    kind: r.kind ?? ("code" as const),
    status: r.status,
    waiting: !!r.waitingOn,
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

// One run's card, subscribed by the message that shows it (components/portal/improvement.tsx).
// Kept out of the message queries so progress updates re-run only this. Members only, like
// the chat it sits in; read-only preview sessions can read it too.
export const card = query({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    await requireMember(ctx, { allowReadonly: true });
    const r = await ctx.db.get(id);
    return r ? cardOf(r) : null;
  },
});

// /improvements: every run, newest first. Members only: requests and errors can mention
// anything said in chat.
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx, { allowReadonly: true });
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
      throw new ConvexError(
        "This is a read-only preview, so changes aren’t saved.",
      );
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
