import type { QueryCtx } from "../_generated/server";
import { CLAUDE_EMAIL } from "./improve";

// The @Claude bot's member row (created by chat:seedChannels via improvements.ensureClaude).
export async function getClaude(ctx: QueryCtx) {
  return await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", CLAUDE_EMAIL))
    .unique();
}
