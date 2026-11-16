// Printed zine orders (/zine's Order panel). Members see their own; everything that changes
// an order after checkout is called by Next.js server code with CONVEX_SERVER_SECRET: the
// Stripe webhook, app/api/zine/print/route.ts (rendering and Lulu), and Lulu's webhook.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import schema, { zineOrderStatus } from "./schema";
import { WEEK_MS, WEEKLY_CAP_CENTS } from "./lib/zine";
import { checkServerSecret, getViewer, requireAdmin, requireMember } from "./lib/viewer";

const fields = schema.tables.zineOrders.validator.fields;

// What a member sees of an order: no Stripe ids, tokens, or file ids.
function view(o: Doc<"zineOrders">) {
  return {
    _id: o._id,
    _creationTime: o._creationTime,
    week: o.week,
    print: o.print,
    quantity: o.quantity,
    pages: o.printedPages ?? o.pages,
    shippingLevel: o.shippingLevel,
    address: o.address,
    totalCents: o.totalCents,
    status: o.status,
    luluStatus: o.luluStatus,
    tracking: o.tracking ?? [],
    error: o.error,
    paidAt: o.paidAt,
  };
}
export type ZineOrderView = ReturnType<typeof view>;

// For the Order panel: who's ordering, and the address from their last paid order.
export const start = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const last = (await mine(ctx, member._id)).find((o) => o.status !== "checkout");
    return {
      memberId: member._id,
      name: member.name,
      email: member.email,
      address: last?.address ?? null,
    };
  },
});

async function mine(ctx: QueryCtx, memberId: Id<"members">) {
  return await ctx.db
    .query("zineOrders")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .order("desc")
    .take(50);
}

// The viewer's orders, newest first. Checkouts that were never paid are left out.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    return (await mine(ctx, member._id))
      .filter((o) => o.status !== "checkout" && o.status !== "canceled")
      .map(view);
  },
});

// Admins: every paid order, for fixing ones that failed.
export const all = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.isAdmin) return null;
    const orders = await ctx.db.query("zineOrders").order("desc").take(200);
    return await Promise.all(
      orders
        .filter((o) => o.status !== "checkout")
        .map(async (o) => ({
          ...view(o),
          member: (await ctx.db.get(o.memberId))?.name ?? "?",
          luluJobId: o.luluJobId,
        })),
    );
  },
});

// ---- Server-only (CONVEX_SERVER_SECRET) ----

const { status: _s, updatedAt: _u, ...draftFields } = fields;
void _s;
void _u;

// What a member's orders in the last 7 days cost (failed and unpaid ones don't count).
async function spentThisWeek(ctx: QueryCtx, memberId: Id<"members">) {
  const since = Date.now() - WEEK_MS;
  return (await mine(ctx, memberId))
    .filter(
      (o) =>
        (o.paidAt ?? 0) > since &&
        o.status !== "checkout" &&
        o.status !== "canceled" &&
        o.status !== "failed",
    )
    .reduce((n, o) => n + o.totalCents, 0);
}

// For the Order panel: how much of the weekly allowance is left.
export const allowance = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    const spent = await spentThisWeek(ctx, member._id);
    return { capCents: WEEKLY_CAP_CENTS, leftCents: Math.max(0, WEEKLY_CAP_CENTS - spent) };
  },
});

// A free order (lib/zine/print.ts#CHARGE_MEMBERS off): saved as paid, within the member's
// weekly allowance. The server action prices it; members can't.
export const placeFree = mutation({
  args: { secret: v.string(), ...draftFields },
  handler: async (ctx, { secret, ...order }) => {
    checkServerSecret(secret);
    const spent = await spentThisWeek(ctx, order.memberId);
    if (spent + order.totalCents > WEEKLY_CAP_CENTS) {
      const left = Math.max(0, WEEKLY_CAP_CENTS - spent);
      throw new ConvexError(
        `Orders are capped at $${WEEKLY_CAP_CENTS / 100} a week per member. You have $${(left / 100).toFixed(2)} left this week.`,
      );
    }
    const now = Date.now();
    return await ctx.db.insert("zineOrders", {
      ...order,
      status: "paid",
      paidAt: now,
      updatedAt: now,
    });
  },
});

// A new order on its way to Stripe Checkout. The server action prices it; members can't.
export const createCheckout = mutation({
  args: {
    secret: v.string(),
    ...draftFields,
    stripeSessionId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, ...order }) => {
    checkServerSecret(secret);
    return await ctx.db.insert("zineOrders", {
      ...order,
      status: "checkout",
      updatedAt: Date.now(),
    });
  },
});

export const setStripeSession = mutation({
  args: { secret: v.string(), id: v.id("zineOrders"), sessionId: v.string() },
  handler: async (ctx, { secret, id, sessionId }) => {
    checkServerSecret(secret);
    await ctx.db.patch(id, { stripeSessionId: sessionId, updatedAt: Date.now() });
  },
});

// Stripe confirmed payment. Returns the order id the first time, null after (or if the amount
// is short), so the webhook starts printing once.
export const markPaid = mutation({
  args: {
    secret: v.string(),
    id: v.string(),
    sessionId: v.string(),
    paymentIntent: v.union(v.string(), v.null()),
    amountCents: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { secret, id, sessionId, paymentIntent, amountCents }) => {
    checkServerSecret(secret);
    const orderId = ctx.db.normalizeId("zineOrders", id);
    const order = orderId ? await ctx.db.get(orderId) : null;
    if (!order || order.stripeSessionId !== sessionId) return null;
    if (order.status !== "checkout") return null;
    if (amountCents === null || amountCents < order.totalCents) {
      await ctx.db.patch(order._id, {
        status: "failed",
        error: `Paid ${amountCents ?? 0}¢ of ${order.totalCents}¢.`,
        updatedAt: Date.now(),
      });
      return null;
    }
    await ctx.db.patch(order._id, {
      status: "paid",
      paidAt: Date.now(),
      stripePaymentIntent: paymentIntent ?? undefined,
      updatedAt: Date.now(),
    });
    return order._id;
  },
});

export const get = query({
  args: { secret: v.string(), id: v.id("zineOrders") },
  handler: async (ctx, { secret, id }) => {
    checkServerSecret(secret);
    return await ctx.db.get(id);
  },
});

// Public URLs of the rendered PDFs, for Lulu to download.
export const fileUrls = query({
  args: { secret: v.string(), id: v.id("zineOrders") },
  handler: async (ctx, { secret, id }) => {
    checkServerSecret(secret);
    const o = await ctx.db.get(id);
    if (!o?.interiorId || !o.coverId) return null;
    return {
      interior: await ctx.storage.getUrl(o.interiorId),
      cover: await ctx.storage.getUrl(o.coverId),
    };
  },
});

export const uploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    checkServerSecret(secret);
    return await ctx.storage.generateUploadUrl();
  },
});

const patchFields = {
  status: v.optional(zineOrderStatus),
  printTokenHash: v.optional(v.union(v.string(), v.null())), // null clears it
  sandboxId: fields.sandboxId,
  interiorId: fields.interiorId,
  coverId: fields.coverId,
  printedPages: fields.printedPages,
  luluJobId: v.optional(v.union(v.number(), v.null())),
  luluStatus: fields.luluStatus,
  tracking: fields.tracking,
  error: v.optional(v.union(v.string(), v.null())),
};

export const update = mutation({
  args: { secret: v.string(), id: v.id("zineOrders"), patch: v.object(patchFields) },
  handler: async (ctx, { secret, id, patch }) => {
    checkServerSecret(secret);
    // null clears a field (undefined would leave it as it is).
    const clean = Object.fromEntries(
      Object.entries(patch).map(([k, val]) => [k, val ?? undefined]),
    );
    await ctx.db.patch(id, { ...clean, updatedAt: Date.now() });
  },
});

// Lulu's webhook: the order for a print job, with its status and tracking.
export const fromLulu = mutation({
  args: {
    secret: v.string(),
    luluJobId: v.number(),
    luluStatus: v.string(),
    tracking: fields.tracking,
    message: v.optional(v.string()),
  },
  handler: async (ctx, { secret, luluJobId, luluStatus, tracking, message }) => {
    checkServerSecret(secret);
    const order = await ctx.db
      .query("zineOrders")
      .withIndex("by_luluJob", (q) => q.eq("luluJobId", luluJobId))
      .unique();
    if (!order) return null;
    const failed = ["REJECTED", "CANCELED", "ERROR"].includes(luluStatus);
    await ctx.db.patch(order._id, {
      luluStatus,
      ...(tracking?.length ? { tracking } : {}),
      status:
        luluStatus === "SHIPPED" ? "shipped" : failed ? "failed" : order.status,
      ...(failed ? { error: message || `Lulu: ${luluStatus.toLowerCase()}` } : {}),
      updatedAt: Date.now(),
    });
    return order._id;
  },
});

// Admins: before retrying a failed order (/zine/orders). Says whether its files are made.
export const claimRetry = mutation({
  args: { id: v.id("zineOrders") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const o = await ctx.db.get(id);
    if (!o || (o.status !== "failed" && o.status !== "paid"))
      throw new ConvexError("Only failed orders can be retried.");
    if (!o.paidAt) throw new ConvexError("That order was never paid.");
    return { hasFiles: !!o.interiorId && !!o.coverId && !o.luluJobId };
  },
});
