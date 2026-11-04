import type { WithoutSystemFields } from "convex/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Adds a chat message and schedules its push notifications (convex/pushAction.ts).
// Everything that posts a message should go through here.
export async function postMessage(
  ctx: MutationCtx,
  message: WithoutSystemFields<Doc<"messages">>,
) {
  const id = await ctx.db.insert("messages", message);
  // Push is off until the VAPID keys are set; don't start an action per message until then.
  if (process.env.VAPID_PRIVATE_KEY)
    await ctx.scheduler.runAfter(0, internal.pushAction.notify, {
      messageId: id,
    });
  return id;
}
