"use node";

// Mirrors the calendar into one shared Google calendar, so changes reach members' Google
// Calendars within seconds (a subscribed iCal feed can take a day). A service account writes
// to it through the Calendar API and shares it with each committed member's sign-in emails.
//
// Convex env: GOOGLE_SERVICE_ACCOUNT_KEY (the service account's JSON key) and
// GOOGLE_CALENDAR_ID (made once with `bunx convex run gcal:createCalendar`). Until both are
// set, everything here is a no-op.
import { createSign } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { TZ } from "./lib/time";

const API = "https://www.googleapis.com/calendar/v3";

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  const key = JSON.parse(raw) as { client_email: string; private_key: string };
  return key;
}

let cached: { token: string; expires: number } | null = null;

async function accessToken() {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const key = serviceAccount();
  if (!key) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY isn’t set.");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok)
    throw new Error(`Google token: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: json.access_token,
    expires: Date.now() + json.expires_in * 1000,
  };
  return cached.token;
}

async function google(method: string, path: string, body?: object) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

const configured = () =>
  !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY && !!process.env.GOOGLE_CALENDAR_ID;
const calendarPath = () =>
  `/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!)}`;

// Google event ids allow only 0-9 and a-v, so use the Convex id in hex.
const googleId = (id: string) => Buffer.from(id).toString("hex");

// Creates or updates (or deletes, if canceled) one event on the Google calendar.
export const syncEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<void> => {
    if (!configured()) return;
    const e = await ctx.runQuery(internal.events.forSync, { eventId });
    const path = `${calendarPath()}/events/${googleId(eventId)}`;
    if (!e || e.canceled) {
      const res = await google("DELETE", path);
      if (!res.ok && res.status !== 404 && res.status !== 410)
        throw new Error(`Google delete: ${res.status} ${await res.text()}`);
      return;
    }
    const body = {
      summary: e.title,
      description: e.description,
      location: e.location,
      start: { dateTime: new Date(e.start).toISOString(), timeZone: TZ },
      end: { dateTime: new Date(e.end).toISOString(), timeZone: TZ },
      source: { title: "Just Write", url: e.url },
      status: "confirmed",
    };
    let res = await google("PUT", path, body);
    if (res.status === 404)
      res = await google("POST", `${calendarPath()}/events`, {
        id: googleId(eventId),
        ...body,
      });
    if (!res.ok)
      throw new Error(`Google sync: ${res.status} ${await res.text()}`);
  },
});

export const syncAll = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    if (!configured()) return;
    const ids: Id<"events">[] = await ctx.runQuery(internal.events.allIds, {});
    for (const eventId of ids)
      await ctx.runAction(internal.gcal.syncEvent, { eventId });
  },
});

// Shares the calendar (read-only) with a member's sign-in emails. Google emails them
// a "calendar shared with you" notice with a button that adds it.
export const shareWith = internalAction({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }): Promise<void> => {
    if (!configured()) return;
    const emails: string[] | null = await ctx.runQuery(
      internal.events.shareTargets,
      { memberId },
    );
    for (const email of emails ?? []) {
      // Leave anyone who already has access (e.g. the owner) alone, so we never downgrade them.
      const existing = await google(
        "GET",
        `${calendarPath()}/acl/${encodeURIComponent(`user:${email}`)}`,
      );
      if (existing.ok) {
        await ctx.runMutation(internal.events.markShared, { memberId, email });
        continue;
      }
      const res = await google(
        "POST",
        `${calendarPath()}/acl?sendNotifications=true`,
        { role: "reader", scope: { type: "user", value: email } },
      );
      if (!res.ok) {
        console.error(`share with ${email}: ${res.status} ${await res.text()}`);
        continue;
      }
      await ctx.runMutation(internal.events.markShared, { memberId, email });
    }
  },
});

// Shares with every committed member. Run after setting up, or any time:
//   bunx convex run gcal:shareAll
export const shareAll = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (!configured()) return "Google Calendar isn’t set up.";
    const ids: Id<"members">[] = await ctx.runQuery(
      internal.events.committedIds,
      {},
    );
    for (const memberId of ids)
      await ctx.runAction(internal.gcal.shareWith, { memberId });
    return `checked ${ids.length} members`;
  },
});

// One-time setup: makes the "Just Write" calendar (owned by the service account) and
// makes `ownerEmail` an owner too, so it shows up in their Google Calendar to manage.
//   bunx convex run gcal:createCalendar '{"ownerEmail": "..."}'
// Then: bunx convex env set GOOGLE_CALENDAR_ID <the id it prints>
export const createCalendar = internalAction({
  args: { ownerEmail: v.string() },
  handler: async (_ctx, { ownerEmail }): Promise<string> => {
    const res = await google("POST", "/calendars", {
      summary: "Just Write",
      description:
        "Sessions and deadlines for Just Write. https://justwrite.club/calendar",
      timeZone: TZ,
    });
    if (!res.ok)
      throw new Error(`Google create: ${res.status} ${await res.text()}`);
    const { id } = (await res.json()) as { id: string };
    const acl = await google(
      "POST",
      `/calendars/${encodeURIComponent(id)}/acl?sendNotifications=true`,
      { role: "owner", scope: { type: "user", value: ownerEmail } },
    );
    if (!acl.ok)
      throw new Error(`Google share: ${acl.status} ${await acl.text()}`);
    return id;
  },
});
