// Limits for printed zine orders, shared by convex/zineOrders.ts and lib/zine/print.ts.

// Just Write covers members' orders for now, up to this much per member over any 7 days.
export const WEEKLY_CAP_CENTS = 100_00;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
