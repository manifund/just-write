// Functions called by trusted Next.js server code (Stripe webhook, email, data import).
// They're public Convex functions guarded by CONVEX_SERVER_SECRET, which only the server knows.
import type { WithoutSystemFields } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { improvementStatus, status } from "./schema";
import {
  endRun,
  mention,
  paragraph,
  postAsClaude,
  postCard,
  releaseWaiting,
  startFromMessage,
  txt,
} from "./improvements";
import {
  AGENT_MODEL,
  BRIEF_IMAGES_MAX,
  GLOBAL_DAILY_LIMIT,
  MAX_PARALLEL,
  MEMBER_DAILY_LIMIT,
  PARALLEL,
  branchFor,
  hashRunToken,
  parseEffort,
} from "./lib/improve";
import { appendLogs } from "./lib/improveLogs";
import { CHECK_IN_SLUG } from "./lib/channels";
import { postMessage } from "./lib/messages";
import { emptyDoc, type RichNode } from "./lib/richtext";
import { checkServerSecret, isAdminEmail } from "./lib/viewer";

// client_reference_id is a Convex member id, or a numeric id from the old Neon table.
async function findByReference(
  ctx: MutationCtx,
  ref: string,
): Promise<Doc<"members"> | null> {
  if (/^\d+$/.test(ref)) {
    return await ctx.db
      .query("members")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", Number(ref)))
      .unique();
  }
  const id = ctx.db.normalizeId("members", ref);
  return id ? await ctx.db.get(id) : null;
}

export const recordStripeSession = mutation({
  args: {
    secret: v.string(),
    memberId: v.id("members"),
    sessionId: v.string(),
  },
  handler: async (ctx, { secret, memberId, sessionId }) => {
    checkServerSecret(secret);
    await ctx.db.patch(memberId, { stripeSessionId: sessionId });
  },
});

// Marks the signer as committed once Stripe confirms payment. Safe to call more than once.
// Returns the member id if a row was updated, else null.
export const markCommitted = mutation({
  args: {
    secret: v.string(),
    reference: v.string(),
    sessionId: v.string(),
    paymentIntent: v.union(v.string(), v.null()),
    amountCents: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    checkServerSecret(args.secret);
    const member = await findByReference(ctx, args.reference);
    if (!member) return null;
    await ctx.db.patch(member._id, {
      status: "committed",
      committedAt: member.committedAt ?? Date.now(),
      stripeSessionId: args.sessionId,
      stripePaymentIntent: args.paymentIntent ?? undefined,
      amountPaidCents: args.amountCents ?? undefined,
    });
    // Welcome them in #general the first time (Stripe may send the webhook twice).
    if (member.status !== "committed") {
      const general = await ctx.db
        .query("channels")
        .withIndex("by_slug", (q) => q.eq("slug", "general"))
        .unique();
      if (general)
        await postMessage(ctx, {
          channelId: general._id,
          authorId: member._id,
          body: JSON.stringify(emptyDoc),
          text: "joined Just Write",
          kind: "joined",
        });
    }
    // Share the Google calendar with them (a no-op once it's shared).
    await ctx.scheduler.runAfter(0, internal.gcal.shareWith, {
      memberId: member._id,
    });
    return member._id;
  },
});

// Claims the one-time signed-terms email. Returns what the email needs, or null if
// it was already sent (or the member isn't committed).
export const claimTermsEmail = mutation({
  args: { secret: v.string(), memberId: v.id("members") },
  handler: async (ctx, { secret, memberId }) => {
    checkServerSecret(secret);
    const m = await ctx.db.get(memberId);
    if (
      !m ||
      m.status !== "committed" ||
      m.termsEmailedAt ||
      !m.signedName ||
      !m.signedAt
    )
      return null;
    await ctx.db.patch(memberId, { termsEmailedAt: Date.now() });
    return {
      email: m.email,
      signedName: m.signedName,
      signedAt: m.signedAt,
      amountPaidCents: m.amountPaidCents ?? null,
    };
  },
});

// Releases the claim if sending failed, so a webhook retry can try again.
export const releaseTermsEmail = mutation({
  args: { secret: v.string(), memberId: v.id("members") },
  handler: async (ctx, { secret, memberId }) => {
    checkServerSecret(secret);
    await ctx.db.patch(memberId, { termsEmailedAt: undefined });
  },
});

// One-time copy of rows from the old Neon `interest` table (scripts/import-neon.ts). Idempotent by email.
export const importLegacy = mutation({
  args: {
    secret: v.string(),
    rows: v.array(
      v.object({
        legacyId: v.number(),
        createdAt: v.number(),
        name: v.string(),
        email: v.string(),
        link: v.union(v.string(), v.null()),
        status,
        signedName: v.union(v.string(), v.null()),
        signedAt: v.union(v.number(), v.null()),
        committedAt: v.union(v.number(), v.null()),
        stripeSessionId: v.union(v.string(), v.null()),
        stripePaymentIntent: v.union(v.string(), v.null()),
        amountPaidCents: v.union(v.number(), v.null()),
        termsEmailedAt: v.union(v.number(), v.null()),
      }),
    ),
  },
  handler: async (ctx, { secret, rows }) => {
    checkServerSecret(secret);
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const fields = {
        legacyId: r.legacyId,
        legacyCreatedAt: r.createdAt,
        name: r.name,
        email: r.email.toLowerCase(),
        link: r.link ?? undefined,
        status: r.status,
        signedName: r.signedName ?? undefined,
        signedAt: r.signedAt ?? undefined,
        committedAt: r.committedAt ?? undefined,
        stripeSessionId: r.stripeSessionId ?? undefined,
        stripePaymentIntent: r.stripePaymentIntent ?? undefined,
        amountPaidCents: r.amountPaidCents ?? undefined,
        termsEmailedAt: r.termsEmailedAt ?? undefined,
      };
      const existing = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", fields.email))
        .unique();
      if (existing) {
        // Never downgrade someone who already committed in Convex.
        const keepStatus =
          existing.status === "committed" ? "committed" : fields.status;
        await ctx.db.patch(existing._id, { ...fields, status: keepStatus });
        updated++;
      } else {
        await ctx.db.insert("members", fields);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

// --- @Claude improvements (called by /api/improve, the sandbox runner, and admin actions) ---

// Marks a queued run as running and returns everything the runner needs. Null if it
// was already claimed, so a retried request can't start a second sandbox.
// `runTokenHash` is the hash of the key the route hands the sandbox (convex/runner.ts).
export const claimImprovement = mutation({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    runTokenHash: v.optional(v.string()),
  },
  handler: async (ctx, { secret, id, runTokenHash }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    // Runs waiting their turn are started by releaseWaiting, which clears waitingOn first.
    if (!r || r.status !== "queued" || r.waitingOn) return null;
    // A chat task's sandbox reads the club's data with this key (convex/chatTasks.ts).
    if (r.kind === "chat" && !runTokenHash)
      throw new ConvexError("A chat task needs a run key.");
    const [root, previous] = await Promise.all([
      ctx.db.get(r.threadId),
      r.previousId ? ctx.db.get(r.previousId) : null,
    ]);
    // continuePr may change this once the route knows which run this continues. A part of a
    // split request already has the effort of the run it was split from (splitRun).
    const effort = parseEffort(r.request) ?? r.effort ?? previous?.effort;
    await ctx.db.patch(id, {
      status: "running",
      startedAt: Date.now(),
      runTokenHash,
      effort,
      model: AGENT_MODEL,
    });

    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", r.threadId))
      .collect();
    const names = new Map<string, string>();
    const thread: {
      author: string;
      text: string;
      at: number;
      images?: string[];
    }[] = [];
    // In #check-ins the agent only learns who wrote what length, apart from the request
    // itself (and, for code runs, the asker's own posts): each member unlocks check-ins by
    // posting, while what Claude writes back is seen by every member, ungated (and, for
    // code runs, in public PRs).
    const channel = await ctx.db.get(r.channelId);
    const inCheckIns = channel?.slug === CHECK_IN_SLUG;
    for (const m of [root, ...replies]) {
      if (!m || (!m.improvementId && !m.text)) continue;
      if (!names.has(m.authorId))
        names.set(
          m.authorId,
          (await ctx.db.get(m.authorId))?.name ?? "Someone",
        );
      const author = names.get(m.authorId)!;
      let text = m.text;
      if (m.improvementId) {
        // Claude's own cards: include what that run did instead of the empty body.
        const earlier = await ctx.db.get(m.improvementId);
        if (!earlier || earlier._id === id) continue;
        if (earlier.kind === "chat" && r.kind !== "chat")
          // What a chat task found comes from members-only data; keep it out of public PRs.
          text = `[Run #${earlier.number}, chat task: its reply is only shown in the thread]`;
        else {
          text = `[Run #${earlier.number}, ${earlier.kind === "chat" ? "chat task, " : ""}${earlier.status}] ${earlier.summary ?? earlier.error ?? ""}`;
          // A chat task's draft or post, so "make it shorter" has something to work from.
          if (earlier.draft && !inCheckIns) {
            const to = await ctx.db.get(earlier.draft.channelId);
            text += `\n\n${earlier.postId ? "Posted" : "Draft"} for #${to?.slug ?? "chat"}:\n${earlier.draft.markdown}`;
          }
        }
      } else if (m.postedFrom && r.kind !== "chat") {
        // Claude's post of a chat task's result: members-only data, kept out of public PRs.
        text = "[A post Claude made for a chat task; only shown in chat]";
      } else if (
        inCheckIns &&
        m._id !== r.requestMessageId &&
        (m.authorId !== r.requesterId || r.kind === "chat")
      ) {
        text = `[a check-in by ${author}, ${m.text.split(/\s+/).filter(Boolean).length} words]`;
      } else {
        // A member's own message, shown as written: its images go to the agent too.
        const images = imageSources(m.body);
        if (images.length) {
          thread.push({ author, text, at: m._creationTime, images });
          continue;
        }
      }
      thread.push({ author, text, at: m._creationTime });
    }
    // Keep only the newest images, so a long thread can't send dozens.
    let imagesLeft = BRIEF_IMAGES_MAX;
    for (const m of [...thread].reverse()) {
      if (!m.images) continue;
      m.images = imagesLeft > 0 ? m.images.slice(-imagesLeft) : [];
      imagesLeft -= m.images.length;
      if (!m.images.length) delete m.images;
    }
    // PRs still open from earlier runs in this thread (the latest run on each). The route
    // decides which one, if any, this request continues (lib/improve-target.ts). A part of a
    // split request always starts its own PR, so it gets none.
    const runs = r.split
      ? []
      : (
          await ctx.db
            .query("improvements")
            .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
            .collect()
        )
          // Chat tasks in the thread don't count: they never have a PR or saved work.
          .filter(
            (e) => e._id !== id && e.number < r.number && e.kind !== "chat",
          )
          .sort((a, b) => b.number - a.number);
    const openPrs = runs
      .filter((e) => e.status === "pr" && e.prNumber)
      .map((e) => ({
        id: e._id,
        run: e.number,
        prNumber: e.prNumber!,
        title: e.title ?? e.request.slice(0, 100),
        request: e.request.slice(0, 500),
      }));
    // The run right before this one, if it failed after its sandbox started (out of steps,
    // timed out, crashed). Its saved sandbox may still hold its edits and agent session, so a
    // reply in the thread picks it up (lib/improve-target.ts).
    const failed =
      runs[0]?.status === "failed" && runs[0].sandboxId ? runs[0] : null;
    return {
      number: r.number,
      kind: r.kind ?? null,
      branch: r.branch,
      prNumber: r.prNumber ?? null,
      // If the earlier run's sandbox is still saved, the agent picks up where it left off.
      resumeSessionId: previous?.sessionId ?? null,
      openPrs,
      // The PR of the run right before this one, if it's still open: the fallback choice.
      latestOpenPr:
        runs[0]?.status === "pr" ? (runs[0].prNumber ?? null) : null,
      failedRun: failed
        ? {
            id: failed._id,
            run: failed.number,
            prNumber: failed.prNumber ?? null,
            title: failed.title ?? failed.request.slice(0, 100),
            request: failed.request.slice(0, 500),
          }
        : null,
      // Set by continuePr when this picks up a failed run.
      resumesFailedRun: null as number | null,
      effort: effort ?? null,
      split: r.split ?? null,
      ...(await whoAndWhere(ctx, r)),
      request: await splitRequest(ctx, r),
      thread,
    };
  },
});

// The request as the agent sees it. For a part of a split request, that's its own part plus
// what the other parts are doing, so it leaves those alone.
async function splitRequest(ctx: MutationCtx, r: Doc<"improvements">) {
  const split = r.split;
  if (!split) return r.request;
  const others = (
    await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
      .collect()
  )
    .filter((e) => e.split?.from === split.from && e._id !== r._id)
    .sort((a, b) => a.split!.part - b.split!.part);
  return [
    r.request,
    `This is part ${split.part} of ${split.of} of one message, which was split into separate runs that work at the same time, each on its own branch and PR. Do only this part. The other parts, which other runs are doing:`,
    ...others.map((e) => `- Run #${e.number}: ${e.request.slice(0, 500)}`),
  ].join("\n\n");
}

// The route split a just-claimed run's request into parts that can be done at the same time
// (lib/improve-split.ts). This run keeps part 1; every other part becomes a run of its own in
// the same thread, with its own card, sandbox, and new PR, and starts right away. Each part
// counts toward the daily limits; parts past them are left out. Returns this run's new brief
// fields, or null if it isn't split (it's already on a PR, or there's room for only one part).
export const splitRun = mutation({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    parts: v.array(v.string()),
  },
  handler: async (ctx, { secret, id, parts }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    if (
      !r ||
      r.status !== "running" ||
      r.kind === "chat" ||
      r.split ||
      r.previousId ||
      r.prNumber ||
      !PARALLEL.test(r.request)
    )
      return null;
    const asked = parts
      .map((p) => p.trim().slice(0, 4000))
      .filter(Boolean)
      .slice(0, MAX_PARALLEL);
    const requester = await ctx.db.get(r.requesterId);
    if (!requester) return null;

    const recent = await ctx.db
      .query("improvements")
      .withIndex("by_number")
      .order("desc")
      .take(GLOBAL_DAILY_LIMIT + 1);
    let room = asked.length - 1;
    if (!isAdminEmail(requester.email)) {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const today = recent.filter((e) => e._creationTime > since);
      const mine = today.filter((e) => e.requesterId === r.requesterId);
      room = Math.min(
        room,
        MEMBER_DAILY_LIMIT - mine.length,
        GLOBAL_DAILY_LIMIT - today.length,
      );
    }
    const kept = asked.slice(0, 1 + Math.max(0, room));
    if (kept.length < 2) return null;

    const of = kept.length;
    await ctx.db.patch(id, {
      request: kept[0],
      split: { from: id, part: 1, of },
    });
    let number = Math.max(recent[0]?.number ?? 0, r.number);
    for (const [i, request] of kept.slice(1).entries()) {
      number++;
      const part = i + 2;
      const child = await ctx.db.insert("improvements", {
        number,
        requesterId: r.requesterId,
        channelId: r.channelId,
        threadId: r.threadId,
        requestMessageId: r.requestMessageId,
        request,
        status: "queued",
        steps: [
          {
            label: `Part ${part} of ${of}, split from run #${r.number}`,
            state: "done",
          },
          { label: "Getting started", state: "active" },
        ],
        branch: branchFor(number),
        effort: r.effort,
        split: { from: id, part, of },
      });
      await postCard(ctx, {
        _id: child,
        channelId: r.channelId,
        threadId: r.threadId,
      });
      // A few seconds apart, so the sandboxes don't all start in the same moment.
      await ctx.scheduler.runAfter(i * 5000, internal.improvements.kick, {
        id: child,
      });
    }
    const updated = await ctx.db.get(id);
    return {
      of,
      left: asked.length - of,
      split: updated!.split!,
      request: await splitRequest(ctx, updated!),
    };
  },
});

// The stored-file URLs of a message's images (set by chat.ts#withImages), in order.
function imageSources(body: string): string[] {
  let doc: RichNode;
  try {
    doc = JSON.parse(body) as RichNode;
  } catch {
    return [];
  }
  return (doc.content ?? [])
    .filter((n) => n.type === "image" && typeof n.attrs?.src === "string")
    .map((n) => n.attrs!.src as string);
}

// Who asked for a run and where, for the prompt, commit message, and PR.
async function whoAndWhere(ctx: MutationCtx, r: Doc<"improvements">) {
  const [requester, channel] = await Promise.all([
    ctx.db.get(r.requesterId),
    ctx.db.get(r.channelId),
  ]);
  return {
    request: r.request,
    // The request didn't mention Claude; the classifier picked it up (convex/untagged.ts).
    untagged: r.untagged ?? false,
    requester: requester?.name ?? "A member",
    channel: channel?.name ?? "chat",
    threadUrl: `${process.env.SITE_URL ?? "https://justwrite.club"}/chat/${channel?.slug ?? "general"}/${r.threadId}`,
  };
}

// The sandbox is done and asks /api/improve to push its changes (or record its answer).
// Checks the run's key and retires it, so this happens once and the sandbox can't report
// anything after it. Returns what the route needs to push and open the PR.
export const startFinish = mutation({
  args: { secret: v.string(), id: v.id("improvements"), runToken: v.string() },
  handler: async (ctx, { secret, id, runToken }) => {
    checkServerSecret(secret);
    const r = await checkRunToken(ctx, id, runToken);
    // Chat tasks finish through chatTasks.finish and never push anything.
    if (r.kind === "chat") throw new ConvexError("This run has ended.");
    // The sandbox is done: its key stops working, and the card stops showing its activity.
    await ctx.db.patch(id, { runTokenHash: undefined, activity: undefined });
    return {
      number: r.number,
      branch: r.branch,
      prNumber: r.prNumber ?? null,
      sandboxId: r.sandboxId ?? null,
      ...(await whoAndWhere(ctx, r)),
    };
  },
});

// The run, if `runToken` is the key for it and it's still going.
export async function checkRunToken(
  ctx: MutationCtx,
  id: Id<"improvements">,
  runToken: string,
) {
  const r = await ctx.db.get(id);
  if (
    !r ||
    r.status !== "running" ||
    !r.runTokenHash ||
    r.runTokenHash !== (await hashRunToken(runToken))
  )
    throw new ConvexError("This run has ended.");
  return r;
}

// Points a just-claimed run at an earlier run in the same thread, so it builds on that
// branch: one with an open PR, or the run right before this one if it failed after its
// sandbox started (its saved sandbox may still have its uncommitted edits and agent
// session). Returns what the runner needs, or null if that run can't be continued.
export const continuePr = mutation({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    previousId: v.id("improvements"),
  },
  handler: async (ctx, { secret, id, previousId }) => {
    checkServerSecret(secret);
    const [r, prev] = await Promise.all([
      ctx.db.get(id),
      ctx.db.get(previousId),
    ]);
    if (!r || !prev || r.status !== "running" || prev.threadId !== r.threadId)
      return null;
    const openPr = prev.status === "pr" && !!prev.prNumber;
    const failed =
      prev.status === "failed" && !!prev.sandboxId && prev.number < r.number;
    if (failed) {
      const later = await ctx.db
        .query("improvements")
        .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
        .collect();
      if (later.some((e) => e.number > prev.number && e.number < r.number))
        return null;
    }
    if (!openPr && !failed) return null;
    // The request's own effort wins; otherwise keep the one the earlier run used.
    const effort = parseEffort(r.request) ?? prev.effort;
    await ctx.db.patch(id, {
      branch: prev.branch,
      previousId: prev._id,
      prNumber: prev.prNumber,
      prUrl: prev.prUrl,
      effort,
    });
    return {
      branch: prev.branch,
      prNumber: prev.prNumber ?? null,
      resumeSessionId: prev.sessionId ?? null,
      resumesFailedRun: failed ? prev.number : null,
      effort: effort ?? null,
    };
  },
});

// An admin's Merge failed because the PR conflicts with main (app/(portal)/(private)/
// improvements/actions.ts). Starts a follow-up on the same PR, in its thread: like every run
// on a PR, it merges main into the branch first and the agent resolves the conflicts. Once
// it's done, its card has the Merge button.
export const fixConflicts = mutation({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    adminId: v.optional(v.id("members")),
  },
  handler: async (ctx, { secret, id, adminId }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    if (!r || r.status !== "pr" || !r.prNumber || r.kind === "chat")
      return { started: false };
    // One at a time: a second Merge click while it's going doesn't start another.
    const inThread = await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
      .collect();
    if (
      inThread.some(
        (e) =>
          e.previousId === r._id &&
          (e.status === "queued" || e.status === "running"),
      )
    )
      return { started: true };
    const member =
      (adminId && (await ctx.db.get(adminId))) ||
      (await ctx.db.get(r.requesterId));
    if (!member) return { started: false };
    const messageId = await postAsClaude(ctx, {
      channelId: r.channelId,
      parentId: r.threadId,
      body: paragraph(
        txt(
          `PR #${r.prNumber} couldn’t merge because it conflicts with newer changes to the site. I’ll merge those in and fix the conflicts.`,
        ),
      ),
    });
    await startFromMessage(ctx, {
      member,
      isAdmin: true,
      channelId: r.channelId,
      messageId,
      parentId: r.threadId,
      text: `Merge main into PR #${r.prNumber} and resolve the merge conflicts, keeping what both sides changed.`,
      continues: r,
    });
    return { started: true };
  },
});

// Follow-ups sent in the thread while this run is going (rows waiting on it). The runner
// polls these while the agent works (convex/runner.ts#followUps) and hands each one to it right
// after its current tool call. Claimed rows are closed out, so they don't also start as their
// own run later.
export async function takeFollowUps(ctx: MutationCtx, r: Doc<"improvements">) {
  const id = r._id;
  const rows = await ctx.db
    .query("improvements")
    .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
    .collect();
  const out = [];
  for (const w of rows) {
    // A chat task sent during a code run gets its own run (and the other way round).
    if (w.waitingOn !== id || w.status !== "queued" || w.kind !== r.kind)
      continue;
    // A part of a split request can't tell which part a follow-up is about, and a request to
    // split needs its own runs, so those wait for this run to end (releaseWaiting).
    if (r.split || PARALLEL.test(w.request)) continue;
    await endRun(ctx, w, {
      status: "answered",
      waitingOn: undefined,
      summary: `Passed this along to run #${r.number} while it was working.`,
      steps: w.steps.map((s) =>
        s.state === "active" ? { ...s, state: "done" as const } : s,
      ),
    });
    const author = await ctx.db.get(w.requesterId);
    out.push({ author: author?.name ?? "A member", text: w.request });
  }
  // Untagged replies (convex/untagged.ts). They may be members talking to each
  // other, and the runner tells the agent so.
  if (r.untaggedReplies?.length) {
    await ctx.db.patch(id, { untaggedReplies: undefined });
    for (const u of r.untaggedReplies) {
      const author = await ctx.db.get(u.authorId);
      out.push({
        author: author?.name ?? "A member",
        text: u.text,
        tagged: false,
      });
    }
  }
  return out;
}

// Progress and results from the runner, and decisions from admins. `step` starts a new
// checklist line (finishing the active one); `fail` marks the active line failed.
export const reportImprovement = mutation({
  args: {
    secret: v.string(),
    id: v.id("improvements"),
    step: v.optional(v.string()),
    fail: v.optional(v.boolean()),
    patch: v.optional(
      v.object({
        status: v.optional(improvementStatus),
        title: v.optional(v.string()),
        summary: v.optional(v.string()),
        files: v.optional(v.array(v.string())),
        checksPassed: v.optional(v.boolean()),
        touchesConvex: v.optional(v.boolean()),
        verdict: v.optional(v.string()),
        prNumber: v.optional(v.number()),
        prUrl: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
        revertPrUrl: v.optional(v.string()),
        sandboxId: v.optional(v.string()),
        sessionId: v.optional(v.string()),
        error: v.optional(v.string()),
        decidedBy: v.optional(v.id("members")),
      }),
    ),
  },
  handler: async (ctx, { secret, id, step, fail, patch = {} }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    if (!r) return;
    await applyReport(ctx, r, { step, fail, patch });
  },
});

// Shared by reportImprovement and the sandbox's runner.report.
export async function applyReport(
  ctx: MutationCtx,
  r: Doc<"improvements">,
  {
    step,
    fail,
    patch,
  }: {
    step?: string;
    fail?: boolean;
    patch: Partial<WithoutSystemFields<Doc<"improvements">>>;
  },
) {
  const id = r._id;
  let steps = r.steps;
  const finish = (state: "done" | "failed") =>
    steps.map((s) => (s.state === "active" ? { ...s, state } : s));
  if (fail) steps = finish("failed");
  if (step) {
    if (steps.at(-1)?.label === step && steps.at(-1)?.state === "active") {
      // same line again; nothing to do
    } else
      steps = [
        ...finish("done"),
        { label: step, state: "active" as const },
      ].slice(-40);
  }
  const final =
    patch.status && patch.status !== "running" && patch.status !== "queued";
  if (final && !fail) steps = finish("done");
  // Steps go in the run's log too, wherever they come from (runner, route, admin actions).
  if (step && steps !== r.steps)
    await appendLogs(ctx, id, [{ kind: "step", text: step }]);
  if (final) await endRun(ctx, r, { ...patch, steps });
  else await ctx.db.patch(id, { ...patch, steps });

  // A follow-up that produced new work takes over the earlier run's card.
  if (r.previousId && (patch.status === "pr" || patch.status === "merged")) {
    const prev = await ctx.db.get(r.previousId);
    if (prev?.status === "pr")
      await ctx.db.patch(prev._id, { status: "superseded" });
  }

  if (final && (r.status === "queued" || r.status === "running"))
    await releaseWaiting(ctx, { ...r, ...patch });

  if (patch.status === "merged" && r.status !== "merged")
    await announceMerge(ctx, { ...r, ...patch });
}

// One line in #site for every change that goes live.
async function announceMerge(ctx: MutationCtx, r: Doc<"improvements">) {
  const site = await ctx.db
    .query("channels")
    .withIndex("by_slug", (q) => q.eq("slug", "site"))
    .unique();
  const requester = await ctx.db.get(r.requesterId);
  const channel = await ctx.db.get(r.channelId);
  if (!site || !requester || !channel) return;
  await postAsClaude(ctx, {
    channelId: site._id,
    body: paragraph(
      txt(
        `Merged #${r.number}: ${r.title ?? r.request.slice(0, 80)}. Asked by `,
      ),
      mention(requester),
      txt(" in "),
      txt(`#${channel.name}`, `/chat/${channel.slug}/${r.threadId}`),
      txt("."),
    ),
  });
}
