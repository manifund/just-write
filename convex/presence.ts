import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireMember } from "./lib/viewer";

export const presence = new Presence(components.presence);

// Rooms are "portal" (anywhere in the portal) or "channel:<slug>". userId is the member id.
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const { member } = await requireMember(ctx);
    if (userId !== member._id)
      throw new ConvexError("Presence is only for yourself.");
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    // No per-user reads here, so every subscriber shares one cached result.
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // Called over HTTP by sendBeacon when a tab closes, so there's no auth here.
    return await presence.disconnect(ctx, sessionToken);
  },
});
