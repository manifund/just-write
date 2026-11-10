import type { WithoutSystemFields } from "convex/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { recordActivity } from "./activity";

// Adds a chat message, records who it involves for /activity, and schedules its push
// notifications (convex/pushAction.ts). Everything that posts a message should go through here.
export async function postMessage(
  ctx: MutationCtx,
  message: WithoutSystemFields<Doc<"messages">>,
) {
  const id = await ctx.db.insert("messages", message);
  // No text means nothing to show yet, like the status card @Claude fills in as it works
  // (it becomes an Activity item when the run ends; see improvements.endRun).
  if (message.text) await recordActivity(ctx, (await ctx.db.get(id))!);
  // Push is off until the VAPID keys are set; don't start an action per message until then.
  if (process.env.VAPID_PRIVATE_KEY)
    await ctx.scheduler.runAfter(0, internal.pushAction.notify, {
      messageId: id,
    });
  return id;
}
