// Functions called by trusted Next.js server code (Stripe webhook, email, data import).
// They're public Convex functions guarded by CONVEX_SERVER_SECRET, which only the server knows.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { improvementStatus, status } from "./schema";
import { mention, paragraph, postAsClaude, releaseWaiting, txt } from "./improvements";
import { postMessage } from "./lib/messages";
import { emptyDoc } from "./lib/richtext";
import { checkServerSecret } from "./lib/viewer";

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
export const claimImprovement = mutation({
  args: { secret: v.string(), id: v.id("improvements") },
  handler: async (ctx, { secret, id }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    if (!r || r.status !== "queued") return null;
    await ctx.db.patch(id, { status: "running", startedAt: Date.now() });

    const [requester, channel, root, previous] = await Promise.all([
      ctx.db.get(r.requesterId),
      ctx.db.get(r.channelId),
      ctx.db.get(r.threadId),
      r.previousId ? ctx.db.get(r.previousId) : null,
    ]);
    const replies = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", r.threadId))
      .collect();
    const names = new Map<string, string>();
    const thread = [];
    for (const m of [root, ...replies]) {
      if (!m || (!m.improvementId && !m.text)) continue;
      if (!names.has(m.authorId))
        names.set(m.authorId, (await ctx.db.get(m.authorId))?.name ?? "Someone");
      // Claude's own cards: include what that run did instead of the empty body.
      let text = m.text;
      if (m.improvementId) {
        const earlier = await ctx.db.get(m.improvementId);
        if (!earlier || earlier._id === id) continue;
        text = `[Run #${earlier.number}, ${earlier.status}] ${earlier.summary ?? earlier.error ?? ""}`;
      }
      thread.push({ author: names.get(m.authorId)!, text, at: m._creationTime });
    }
    return {
      number: r.number,
      branch: r.branch,
      prNumber: r.prNumber ?? null,
      // If the earlier run's sandbox is still saved, the agent picks up where it left off.
      resumeSessionId: previous?.sessionId ?? null,
      request: r.request,
      requester: requester?.name ?? "A member",
      channel: channel?.name ?? "chat",
      threadUrl: `${process.env.SITE_URL ?? "https://justwrite.club"}/chat/${channel?.slug ?? "general"}/${r.threadId}`,
      thread,
    };
  },
});

// Follow-ups sent in the thread while this run is going (rows waiting on it). The runner
// polls this while the agent works and hands each one to it right after its current tool
// call. Claimed rows are closed out, so they don't also start as their own run later.
export const claimFollowUps = mutation({
  args: { secret: v.string(), id: v.id("improvements") },
  handler: async (ctx, { secret, id }) => {
    checkServerSecret(secret);
    const r = await ctx.db.get(id);
    if (!r || r.status !== "running") return [];
    const rows = await ctx.db
      .query("improvements")
      .withIndex("by_thread", (q) => q.eq("threadId", r.threadId))
      .collect();
    const out = [];
    for (const w of rows) {
      if (w.waitingOn !== id || w.status !== "queued") continue;
      await ctx.db.patch(w._id, {
        status: "answered",
        waitingOn: undefined,
        summary: `Passed this along to run #${r.number} while it was working.`,
        finishedAt: Date.now(),
        steps: w.steps.map((s) =>
          s.state === "active" ? { ...s, state: "done" as const } : s,
        ),
      });
      const author = await ctx.db.get(w.requesterId);
      out.push({ author: author?.name ?? "A member", text: w.request });
    }
    return out;
  },
});

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
    let steps = r.steps;
    const finish = (state: "done" | "failed") =>
      steps.map((s) => (s.state === "active" ? { ...s, state } : s));
    if (fail) steps = finish("failed");
    if (step) {
      if (steps.at(-1)?.label === step && steps.at(-1)?.state === "active") {
        // same line again; nothing to do
      } else steps = [...finish("done"), { label: step, state: "active" as const }].slice(-40);
    }
    const final = patch.status && patch.status !== "running" && patch.status !== "queued";
    if (final && !fail) steps = finish("done");
    await ctx.db.patch(id, {
      ...patch,
      steps,
      ...(final && !r.finishedAt ? { finishedAt: Date.now() } : {}),
    });

    // A follow-up that produced new work takes over the earlier run's card.
    if (
      r.previousId &&
      (patch.status === "pr" || patch.status === "merged")
    ) {
      const prev = await ctx.db.get(r.previousId);
      if (prev?.status === "pr")
        await ctx.db.patch(prev._id, { status: "superseded" });
    }

    if (final && (r.status === "queued" || r.status === "running"))
      await releaseWaiting(ctx, { ...r, ...patch });

    if (patch.status === "merged" && r.status !== "merged")
      await announceMerge(ctx, { ...r, ...patch });
  },
});

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
      txt(`Merged #${r.number}: ${r.title ?? r.request.slice(0, 80)}. Asked by `),
      mention(requester),
      txt(" in "),
      txt(`#${channel.name}`, `/chat/${channel.slug}/${r.threadId}`),
      txt("."),
    ),
  });
}
