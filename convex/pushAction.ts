"use node";

import { v } from "convex/values";
import { sendNotification, WebPushError } from "web-push";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { pushEndpoint } from "./lib/pushEndpoint";

// Sends push notifications about a new chat message. The mutations that post messages
// schedule this; push.recipients decides who gets one. Does nothing until the VAPID keys are set.
export const notify = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return;
    const data = await ctx.runQuery(internal.push.recipients, { messageId });
    if (!data) return;

    const vapidDetails = {
      subject: "https://justwrite.club",
      publicKey,
      privateKey,
    };
    const gone: Id<"pushSubscriptions">[] = [];
    await Promise.all(
      data.recipients.flatMap(({ subscriptions, badge, body }) =>
        subscriptions.map(async (s) => {
          // Checked when saved too; this also covers rows saved before the check existed.
          const endpoint = pushEndpoint(s.endpoint);
          if (!endpoint) {
            gone.push(s._id);
            return;
          }
          try {
            await sendNotification(
              {
                endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth },
              },
              JSON.stringify({ ...data.notification, body, badge }),
              // A stalled push service shouldn't hold the action open.
              { vapidDetails, TTL: 60 * 60 * 24, timeout: 10_000 },
            );
          } catch (err) {
            // 404/410: the browser unsubscribed or the subscription expired.
            if (
              err instanceof WebPushError &&
              (err.statusCode === 404 || err.statusCode === 410)
            )
              gone.push(s._id);
            else
              console.error(
                `Push to ${new URL(endpoint).host} failed:`,
                err instanceof WebPushError ? err.statusCode : err,
              );
          }
        }),
      ),
    );
    if (gone.length) await ctx.runMutation(internal.push.forget, { ids: gone });
  },
});
