// Thread replies that reach @Claude without a mention (docs/claude-tag-comparison.md,
// proposal 2). chat.send calls handleUntaggedReply for every reply that doesn't mention
// Claude:
//
// - While a code run in the thread is going, the reply is queued on it (`untaggedReplies`)
//   and server.takeFollowUps hands it to the agent, which is told it may be members talking
//   to each other.
// - While a run is queued, nothing happens: its brief is read from the thread when it starts.
// - Otherwise, for a day after Claude's last run in the thread, a quick model call (check)
//   decides whether the reply asks Claude for something. If it does, pickUp starts a run as
//   if the reply had been tagged, and the card says so.
//
// Never in #check-ins, whose text stays behind its gate. `@Claude !mute` in a thread turns all
// of this off there (improvements.startFromMessage), and `@Claude !unmute` turns it back on.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { startFromMessage } from "./improvements";
import { CHECK_IN_SLUG } from "./lib/channels";
import {
  CLASSIFIER_MODEL,
  UNTAGGED_CHECKS_PER_DAY,
  UNTAGGED_PER_RUN,
  UNTAGGED_WINDOW_MS,
} from "./lib/improve";
import { isAdminEmail } from "./lib/viewer";

const DAY = 24 * 60 * 60 * 1000;
const CONTEXT_MESSAGES = 12; // thread messages the classifier sees, newest last

export async function threadSettings(ctx: QueryCtx, threadId: Id<"messages">) {
  return await ctx.db
    .query("claudeThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
}

export async function setMuted(
  ctx: MutationCtx,
  threadId: Id<"messages">,
  muted: boolean,
) {
  const row = await threadSettings(ctx, threadId);
  if (row) await ctx.db.patch(row._id, { muted });
  else await ctx.db.insert("claudeThreads", { threadId, muted });
}

async function threadRuns(ctx: QueryCtx, threadId: Id<"messages">) {
  return await ctx.db
    .query("improvements")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(20);
}

// Called from chat.send for a reply that doesn't mention Claude.
export async function handleUntaggedReply(
  ctx: MutationCtx,
  args: {
    channel: Doc<"channels">;
    threadId: Id<"messages">;
    messageId: Id<"messages">;
    authorId: Id<"members">;
    text: string;
  },
) {
  if (args.channel.slug === CHECK_IN_SLUG) return;
  const runs = await threadRuns(ctx, args.threadId);
  if (runs.length === 0) return; // Claude isn't in this thread
  const settings = await threadSettings(ctx, args.threadId);
  if (settings?.muted) return;

  const running = runs.find((r) => !r.kind && r.status === "running");
  if (running) {
    // A run someone stopped takes no more follow-ups (runner.followUps), and the parts of a
    // split request can't tell which part a reply is about (server.takeFollowUps).
    if (running.stopRequestedAt || running.split) return;
    const pending = running.untaggedReplies ?? [];
    if (pending.length >= UNTAGGED_PER_RUN) return;
    await ctx.db.patch(running._id, {
      untaggedReplies: [
        ...pending,
        { authorId: args.authorId, text: args.text.slice(0, 4000) },
      ],
    });
    return;
  }
  if (runs.some((r) => r.status === "queued")) return;

  // A running chat task falls through: if the reply is a request, it waits for that task
  // like a tagged one would.
  const latest = runs[0];
  const lastActive =
    latest.status === "running"
      ? Date.now()
      : (latest.finishedAt ?? latest._creationTime);
  if (Date.now() - lastActive > UNTAGGED_WINDOW_MS) return;

  const now = Date.now();
  const checks = (settings?.checks ?? []).filter((t) => t > now - DAY);
  if (checks.length >= UNTAGGED_CHECKS_PER_DAY) return;
  if (settings) await ctx.db.patch(settings._id, { checks: [...checks, now] });
  else
    await ctx.db.insert("claudeThreads", {
      threadId: args.threadId,
      checks: [now],
    });
  await ctx.scheduler.runAfter(0, internal.untagged.check, {
    messageId: args.messageId,
  });
}

// The thread as the classifier sees it: the last few messages, with Claude's cards as what
// that run did.
export const context = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (!m?.parentId) return null;
    const root = await ctx.db.get(m.parentId);
    if (!root) return null;
    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", root._id))
      .collect();
    const upTo = [root, ...replies].filter(
      (r) => r._creationTime <= m._creationTime && r._id !== m._id,
    );
    const names = new Map<string, string>();
    const lines: string[] = [];
    for (const r of upTo.slice(-CONTEXT_MESSAGES)) {
      if (!names.has(r.authorId))
        names.set(
          r.authorId,
          (await ctx.db.get(r.authorId))?.name ?? "Someone",
        );
      let text = r.text;
      if (r.improvementId) {
        const run = await ctx.db.get(r.improvementId);
        if (!run) continue;
        text = `[Claude, run #${run.number}, ${run.kind === "chat" ? "chat task, " : ""}${run.status}] ${run.summary ?? run.error ?? ""}`;
      }
      if (!text) continue;
      lines.push(`${names.get(r.authorId)}: ${text.slice(0, 2000)}`);
    }
    const author = await ctx.db.get(m.authorId);
    return {
      thread: lines,
      author: author?.name ?? "A member",
      text: m.text.slice(0, 4000),
    };
  },
});

// Asks a quick model whether the reply is a request for Claude.
export const check = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return;
    const brief = await ctx.runQuery(internal.untagged.context, { messageId });
    if (!brief) return;
    let out: { request?: unknown; reason?: unknown };
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: CLASSIFIER_MODEL,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'In a writing club\'s chat, members ask Claude, an AI agent, to change the club\'s website or to look things up and post in chat. Claude has already worked in this thread. A member just replied without mentioning @Claude. Decide whether the reply asks Claude to do something now: a new instruction, a correction, a retry, or more work on what Claude did ("also make it blue", "can you try again", "that broke the menu"). Members also talk to each other in these threads. Thanks, praise, reactions, reports that it works, questions to other members, and general discussion are not requests. When unsure, answer no. ' +
                'Answer with JSON {"request": true|false, "reason": "<under 12 words>"}.',
            },
            {
              role: "user",
              content: [
                `Thread so far:\n${brief.thread.join("\n\n").slice(-20_000)}`,
                `New reply from ${brief.author}:\n${brief.text}`,
              ].join("\n\n"),
            },
          ],
        }),
      });
      const data = await res.json();
      out = JSON.parse(data.choices[0].message.content);
    } catch (err) {
      console.error("untagged: classifying a reply failed", messageId, err);
      return;
    }
    if (out.request !== true) return;
    await ctx.runMutation(internal.untagged.pickUp, {
      messageId,
      reason: String(out.reason ?? "").slice(0, 120),
    });
  },
});

// Starts a run from a reply the classifier judged a request, unless things changed since:
// the reply was deleted, the thread was muted, or a run started after it (its brief has it).
export const pickUp = internalMutation({
  args: { messageId: v.id("messages"), reason: v.string() },
  handler: async (ctx, { messageId, reason }) => {
    const m = await ctx.db.get(messageId);
    if (!m?.parentId) return;
    if ((await threadSettings(ctx, m.parentId))?.muted) return;
    const runs = await threadRuns(ctx, m.parentId);
    if (
      runs.some(
        (r) =>
          r._creationTime > m._creationTime ||
          r.requestMessageId === m._id ||
          (!r.kind && r.status === "running"),
      )
    )
      return;
    const member = await ctx.db.get(m.authorId);
    if (!member || member.bot) return;
    const isAdmin =
      isAdminEmail(member.email) ||
      (!!member.altEmail && isAdminEmail(member.altEmail));
    if (!isAdmin && member.status !== "committed") return;
    await startFromMessage(ctx, {
      member,
      isAdmin,
      channelId: m.channelId,
      messageId: m._id,
      parentId: m.parentId,
      text: m.text,
      untagged: { reason },
    });
  },
});
