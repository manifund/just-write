import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fillSlots } from "./lib/program";
import { requireAdmin } from "./lib/viewer";

// Everything the /admin page shows: every row, with essays and slot progress.
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const members = await ctx.db.query("members").collect();
    const essays = await ctx.db.query("essays").collect();
    return members
      .sort(
        (a, b) =>
          (b.legacyCreatedAt ?? b._creationTime) -
          (a.legacyCreatedAt ?? a._creationTime),
      )
      .map((m) => {
        const mine = essays
          .filter((e) => e.memberId === m._id)
          .sort((a, b) => a.submittedAt - b.submittedAt);
        return {
          ...m,
          createdAt: m.legacyCreatedAt ?? m._creationTime,
          essays: mine,
          slotsFilled: fillSlots(mine).filter((s) => s.essayId).length,
        };
      });
  },
});

export const setEssayReview = mutation({
  args: {
    essayId: v.id("essays"),
    review: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
  },
  handler: async (ctx, { essayId, review }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(essayId, { review });
  },
});
