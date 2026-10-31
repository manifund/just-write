// Functions called by trusted Next.js server code (Stripe webhook, email, data import).
// They're public Convex functions guarded by CONVEX_SERVER_SECRET, which only the server knows.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { status } from "./schema";
import { checkServerSecret } from "./lib/viewer";

// client_reference_id is a Convex member id, or a numeric id from the old Neon table.
async function findByReference(ctx: MutationCtx, ref: string): Promise<Doc<"members"> | null> {
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
  args: { secret: v.string(), memberId: v.id("members"), sessionId: v.string() },
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
    if (!m || m.status !== "committed" || m.termsEmailedAt || !m.signedName || !m.signedAt) return null;
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
        const keepStatus = existing.status === "committed" ? "committed" : fields.status;
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
