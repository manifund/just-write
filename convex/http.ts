import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { buildIcs } from "./lib/ics";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

// A member's personal iCal feed: /calendar.ics?token=…[&only=mine] (see events.makeFeed).
http.route({
  path: "/calendar.ics",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    const token = params.get("token") ?? "";
    // ?only=mine: deadlines plus the sessions this member hosts or is going to.
    const mine = params.get("only") === "mine";
    const events = await ctx.runQuery(internal.events.feed, { token, mine });
    if (!events) return new Response("Not found", { status: 404 });
    return new Response(
      buildIcs(events, mine ? "Just Write (mine)" : undefined),
      {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }),
});

export default http;
