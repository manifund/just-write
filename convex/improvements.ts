// @Claude site improvements. A member mentions Claude in chat; chat.send calls
// startFromMessage, which records a run, posts Claude's status card in the thread, and
// asks the Next.js route /api/improve to start a Vercel Sandbox. The runner inside it
// (scripts/improve-runner.ts) reports progress back through server.reportImprovement.
import {
  paginationOptsValidator,
  type WithoutSystemFields,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  CLAUDE_EMAIL,
  GLOBAL_DAILY_LIMIT,
  MEMBER_DAILY_LIMIT,
  branchFor,
  isChatTask,
  claudeCommand,
  modelLabel,
  restartCommand,
  staleAfterMs,
} from "./lib/improve";
import { checkInGate, veil } from "./chat";
import { recordActivity } from "./lib/activity";
import { appendLogs } from "./lib/improveLogs";
import { getClaude } from "./lib/claude";
import { postMessage } from "./lib/messages";
import { emptyDoc, type RichNode } from "./lib/richtext";
import { publicMember, requireAdmin, requireMember } from "./lib/viewer";
import { setMuted } from "./untagged";

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

const HELP_TEXT = [
  "Mention me with a request and I’ll change the site and open a PR.",
  "Write “chat task” to have me read the club’s data and answer or post a message instead.",
  "“new PR” starts a fresh PR; “#40” or “continue #40” works on that PR.",
  "“effort: high” (low, medium, high, xhigh, max) sets how hard I think.",
  "“in parallel” splits a list of changes into separate runs and PRs.",
  "Replies in a thread reach me without a tag while I’m working and for a day after.",
  "“!restart” redoes the thread’s last request on the same PR with a fresh session, plus any directions after it.",
  "Commands, on their own: !status, !help, !mute (only tagged messages reach me here), !unmute.",
].join(" ");

const STATUS_WORDS: Record<Doc<"improvements">["status"], string> = {
  queued: "is waiting to start",
  running: "is running",
  answered: "answered",
  pr: "opened a PR",
  merged: "was merged",
  closed: "was closed",
  failed: "failed",
  superseded: "was followed by a newer run",
};

function statusText(r: Doc<"improvements">) {
  const step =
    r.status === "running" || r.status === "queued"
      ? r.steps.findLast((s) => s.state === "active")?.label
      : undefined;
  const pr = r.prNumber ? ` (PR #${r.prNumber})` : "";
  return `Run #${r.number}${pr} ${STATUS_WORDS[r.status]}${step ? `: ${step}` : ""}.`;
}

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
    // A reply that didn't mention Claude, judged a request by the classifier (convex/untagged.ts).
    // If it can't start (limits, not switched on), nothing is posted: nobody asked out loud.
    untagged?: { reason: string };
  },
) {
  const threadId = args.parentId ?? args.messageId;
  const reply = async (text: string) =>
    args.untagged
      ? null
      : await postAsClaude(ctx, {
          channelId: args.channelId,
          parentId: threadId,
          body: paragraph(mention(args.member), txt(` ${text}`)),
        });

  // "@Claude !mute" / "!unmute": whether untagged replies in this thread reach Claude.
  // "!status" / "!help": a short reply, no run (convex/lib/improve.ts#claudeCommand).
  const command =
    args.untagged || args.continues ? null : claudeCommand(args.text);
  if (command === "help") return await reply(HELP_TEXT);
  if (command === "status") {
    const latest = await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .first();
    return await reply(
      latest ? statusText(latest) : "I haven’t run in this thread yet.",
    );
  }
  if (command) {
    if (command === "unmute") {
      await setMuted(ctx, threadId, false);
      return await reply(
        "Okay. Replies in this thread reach me again without a tag, for a day after my last run here. Write @Claude !mute to stop that.",
      );
    }
    await setMuted(ctx, threadId, true);
    return await reply(
      "Okay. In this thread I’ll only read messages that mention @Claude. Write @Claude !unmute to change that back.",
    );
  }

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
  // "@Claude !restart": start the thread's latest code run over with a fresh agent session.
  const restartNote =
    args.untagged || args.continues ? null : restartCommand(args.text);
  let restartOf: Doc<"improvements"> | null = null;
  if (restartNote !== null) {
    restartOf = earlier.find((r) => r.kind !== "chat") ?? null;
    if (!restartOf)
      return await reply(
        "There’s nothing to restart in this thread yet. Ask me for a change first.",
      );
    if (restartOf.status === "queued" || restartOf.status === "running") {
      if (restartOf.requesterId !== args.member._id && !args.isAdmin)
        return await reply(
          `Only the person who asked for run #${restartOf.number}, or an admin, can restart it while it’s going.`,
        );
      await requestStop(ctx, restartOf, args.member);
      restartOf = (await ctx.db.get(restartOf._id)) ?? restartOf;
    }
  }
  const kind =
    args.continues || restartOf
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
  // A restart waits for the run it stopped to wrap up (its edits get pushed first).
  const busy = restartOf
    ? restartOf.status === "running"
      ? restartOf
      : (earlier.find(
          (r) =>
            r._id !== restartOf._id &&
            r.kind !== "chat" &&
            (r.status === "queued" || r.status === "running"),
        ) ?? null)
    : (earlier.find(
        (r) =>
          r.kind === kind && (r.status === "queued" || r.status === "running"),
      ) ?? null);

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
    untagged: args.untagged ? true : undefined,
    // Which PR it goes on is settled when it starts (server.claimImprovement), since a
    // stopped run may only open its PR as it wraps up.
    ...(restartOf && {
      previousId: restartOf._id,
      restart: {
        run: restartOf.number,
        request: (restartOf.restart?.request ?? restartOf.request).slice(
          0,
          8000,
        ),
      },
    }),
    branch: args.continues?.branch ?? branchFor(number),
    ...(args.continues && {
      previousId: args.continues._id,
      prNumber: args.continues.prNumber,
      prUrl: args.continues.prUrl,
    }),
  });
  const replyMessageId = await postCard(ctx, {
    _id: id,
    channelId: args.channelId,
    threadId,
  });
  if (args.untagged)
    await appendLogs(ctx, id, [
      {
        kind: "info",
        text: `Picked up a reply that didn’t mention @Claude. The classifier’s reason: ${args.untagged.reason || "none given"}`,
      },
    ]);
  if (!busy)
    await ctx.scheduler.runAfter(0, internal.improvements.kick, { id });
  return replyMessageId;
}

// Posts a run's status card in its thread (components/portal/improvement.tsx fills it in).
export async function postCard(
  ctx: MutationCtx,
  r: Pick<Doc<"improvements">, "_id" | "channelId" | "threadId">,
) {
  const replyMessageId = await postAsClaude(ctx, {
    channelId: r.channelId,
    parentId: r.threadId,
    body: emptyDoc,
    improvementId: r._id,
  });
  await ctx.db.patch(r._id, { replyMessageId });
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
    // The parts of a split request (server.splitRun) run side by side. A follow-up could be
    // about any of them, so it waits until they've all ended, then the route picks its PR.
    const sibling = waiters.find(
      (o) =>
        o._id !== w._id &&
        o._id !== finished._id &&
        o.kind === w.kind &&
        !o.waitingOn &&
        (o.status === "queued" || o.status === "running"),
    );
    if (sibling) {
      await ctx.db.patch(w._id, { waitingOn: sibling._id });
      continue;
    }
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
    activity: undefined,
    ...(first ? { finishedAt: Date.now() } : {}),
  });
  if (!first) return;
  const after = { ...r, ...patch };
  await appendLogs(ctx, r._id, [
    {
      kind: after.status === "failed" ? "error" : "info",
      text: `Run ended: ${after.status}${after.error ? `. ${after.error}` : ""}`,
    },
  ]);
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
  extra: Partial<WithoutSystemFields<Doc<"improvements">>> = {},
) {
  await endRun(ctx, r, {
    ...extra,
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

// The Stop button on a running card, for the member who asked and for admins. A run that
// hasn't started, or a chat task, ends here. A code run's runner sees the request on its next
// poll (runner.followUps), stops the agent, and pushes any edits as an unfinished PR, which
// never merges on its own; its sandbox and agent session are kept, so "@Claude continue"
// picks it up. If the runner doesn't wrap up in time, forceStop ends the run anyway.
const STOP_GRACE_MS = 90_000;

export const stop = mutation({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    const viewer = await requireMember(ctx);
    const r = await ctx.db.get(id);
    if (!r) throw new ConvexError("That request is gone.");
    if (r.requesterId !== viewer.member._id && !viewer.isAdmin)
      throw new ConvexError(
        "Only the person who asked, or an admin, can stop this.",
      );
    await requestStop(ctx, r, viewer.member);
  },
});

// Stops a run for `by` (the Stop button, or "@Claude !restart"). A queued run or a chat task
// ends right away; a code run's runner sees it on its next poll and wraps up.
async function requestStop(
  ctx: MutationCtx,
  r: Doc<"improvements">,
  by: Doc<"members">,
) {
  if ((r.status !== "queued" && r.status !== "running") || r.stopRequestedAt)
    return;
  const stopped = { stoppedBy: by._id, stopRequestedAt: Date.now() };
  if (r.status === "queued" || r.kind === "chat")
    return await failRun(ctx, r, `Stopped by ${by.name}.`, {
      ...stopped,
      waitingOn: undefined,
    });
  await ctx.db.patch(r._id, {
    ...stopped,
    steps: [
      ...r.steps.map((s) =>
        s.state === "active" ? { ...s, state: "done" as const } : s,
      ),
      {
        label: `Stopping, as ${by.name} asked`,
        state: "active" as const,
      },
    ].slice(-40),
  });
  await ctx.scheduler.runAfter(STOP_GRACE_MS, internal.improvements.forceStop, {
    id: r._id,
  });
}

// The runner didn't wrap up after a stop (stuck in a tool call, or never polled): end the run
// and stop its sandbox, which keeps its edits in the saved snapshot for a follow-up.
export const forceStop = internalMutation({
  args: { id: v.id("improvements") },
  handler: async (ctx, { id }) => {
    const r = await ctx.db.get(id);
    if (!r || r.status !== "running" || !r.stopRequestedAt) return;
    const by = r.stoppedBy && (await ctx.db.get(r.stoppedBy));
    await failRun(ctx, r, `Stopped by ${by?.name ?? "a member"}.`);
    if (r.kind !== "chat" && r.sandboxId)
      await ctx.scheduler.runAfter(0, internal.chatTasks.stopSandbox, {
        name: r.sandboxId,
      });
  },
});

// Runs that never reported back are marked failed: the sandbox died or timed out, or
// /api/improve was killed before it could say so. failRun releases follow-ups waiting on them.
export const reapStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("improvements")
      .withIndex("by_number")
      .order("desc")
      .take(50);
    for (const r of rows) {
      if (r.status !== "queued" && r.status !== "running") continue;
      if (r.waitingOn) {
        // Waiting its turn, not stuck, unless the run it waits on has already ended.
        const on = await ctx.db.get(r.waitingOn);
        if (on && on.status !== "queued" && on.status !== "running")
          await releaseWaiting(ctx, on);
      } else if ((r.startedAt ?? r._creationTime) < now - staleAfterMs(r.kind))
        await failRun(ctx, r, "The sandbox stopped before finishing.");
    }
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
    untagged: r.untagged ?? false,
    requesterId: r.requesterId,
    stopping:
      !!r.stopRequestedAt && (r.status === "queued" || r.status === "running"),
    stopped: !!r.stoppedBy,
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
    conflicts: r.status === "pr" && !!r.conflictsWithMain,
    error: r.error ?? null,
    startedAt: r.startedAt ?? null,
    finishedAt: r.finishedAt ?? null,
    activity: r.status === "running" ? (r.activity ?? null) : null,
    // "Opus 5.5, high effort". Runs from before models were saved show nothing.
    model: r.model
      ? `${modelLabel(r.model)}, ${r.effort ?? "default"} effort`
      : null,
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
    // Another run in the thread may be about to push to this PR (a queued follow-up only moves
    // onto the PR's branch once it starts), so merging now could ship commits nobody saw.
    const others = await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
      .collect();
    const busy = others.some(
      (o) =>
        o._id !== r._id &&
        o.kind !== "chat" && // chat tasks never push code
        (o.status === "queued" || o.status === "running"),
    );
    return {
      status: r.status,
      busy,
      branch: r.branch,
      prNumber: r.prNumber ?? null,
      revertPrUrl: r.revertPrUrl ?? null,
      adminId: viewer.member?._id ?? null,
    };
  },
});

// /improvements/<id>/log. Members only, like /improvements: the coding agent has no live site
// data (no GitHub token or server secret in the sandbox, only public queries), so the member
// content a log can hold is the chat thread it was asked in and its follow-ups. Members can
// read those in chat, except in #check-ins, where others' posts stay previews until you've
// checked in (chat.ts#checkInGate): there the log is hidden while the thread's first post
// would be. That's enough, since replies show whenever their root does (chat.ts#veil).
// Chat tasks (convex/chatTasks.ts) read the club's data, so their logs are for admins only.
async function canReadLog(ctx: QueryCtx, r: Doc<"improvements">) {
  const viewer = await requireMember(ctx, { allowReadonly: true });
  if (viewer.isAdmin) return true;
  if (r.kind === "chat") return false;
  const [channel, root] = await Promise.all([
    ctx.db.get(r.channelId),
    ctx.db.get(r.threadId),
  ]);
  if (!channel || !root) return false; // a deleted thread's log isn't shown either
  return !veil(root, await checkInGate(ctx, channel, viewer.member)).hidden;
}

// `id` comes from the URL, so it's checked here rather than by the validator.
export const logRun = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireMember(ctx, { allowReadonly: true });
    const id = ctx.db.normalizeId("improvements", args.id);
    const r = id && (await ctx.db.get(id));
    if (!r) return null;
    const [channel, previous, next, readable] = await Promise.all([
      ctx.db.get(r.channelId),
      r.previousId ? ctx.db.get(r.previousId) : null,
      // A later run that continued this one, if any.
      ctx.db
        .query("improvements")
        .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
        .filter((q) => q.eq(q.field("previousId"), r._id))
        .first(),
      canReadLog(ctx, r),
    ]);
    return {
      // What /improvements already shows, plus whether the log itself is readable.
      ...cardOf(r),
      request: r.request,
      effort: r.effort ?? null,
      threadHref: `/chat/${channel?.slug ?? "general"}/${r.threadId}`,
      previous: previous ? { id: previous._id, number: previous.number } : null,
      next: next ? { id: next._id, number: next.number } : null,
      readable,
    };
  },
});

export const logs = query({
  args: { id: v.id("improvements"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { id, paginationOpts }) => {
    const r = await ctx.db.get(id);
    if (!r || !(await canReadLog(ctx, r)))
      return { page: [], isDone: true, continueCursor: "" };
    return await ctx.db
      .query("improvementLogs")
      .withIndex("by_improvement", (q) => q.eq("improvementId", id))
      .paginate(paginationOpts);
  },
});
