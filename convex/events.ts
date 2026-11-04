import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { sendEmail } from "./lib/email";
import { postMessage } from "./lib/messages";
import type { RichNode } from "./lib/richtext";
import { fmtWhen, ptToUtc } from "./lib/time";
import { parseWebsite, slugify } from "./lib/util";
import {
  canEnter,
  getViewer,
  publicMember,
  requireAdmin,
  requireMember,
  type PublicMember,
} from "./lib/viewer";

export const MEETUPS_SLUG = "meetups";
// Links in emails and Google Calendar always go to the live site (SITE_URL is localhost here).
const SITE = "https://justwrite.club";
const MAX_DURATION = 7 * 24 * 3600_000;
const response = v.union(v.literal("yes"), v.literal("maybe"), v.literal("no"));

// ---------- Reading ----------

function isHost(e: Doc<"events">, memberId: Id<"members"> | undefined) {
  return !!memberId && (e.ownerId === memberId || e.cohostIds.includes(memberId));
}

// Hosts (and admins) can edit a session; deadline reminders are admin-only.
function canEdit(
  e: Doc<"events">,
  memberId: Id<"members"> | undefined,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  return e.kind !== "deadline" && isHost(e, memberId);
}

async function hydrate(
  ctx: QueryCtx,
  e: Doc<"events">,
  viewer: { memberId?: Id<"members">; isMember: boolean; isAdmin: boolean },
) {
  const member = async (id: Id<"members">) => {
    const m = await ctx.db.get(id);
    return m ? publicMember(m) : null;
  };
  const rsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_event", (q) => q.eq("eventId", e._id))
    .collect();
  const people = { yes: [], maybe: [], no: [] } as Record<
    "yes" | "maybe" | "no",
    PublicMember[]
  >;
  for (const r of rsvps.sort((a, b) => a.updatedAt - b.updatedAt)) {
    const m = await member(r.memberId);
    if (m) people[r.response].push(m);
  }
  const hosts = (
    await Promise.all([e.ownerId, ...e.cohostIds].map(member))
  ).filter((m): m is PublicMember => !!m);
  return {
    _id: e._id,
    slug: e.slug ?? e._id,
    title: e.title,
    description: e.description ?? null,
    start: e.start,
    end: e.end,
    kind: e.kind ?? null,
    canceled: !!e.canceledAt,
    hasLocation: !!e.location,
    hasLink: !!e.link,
    // Addresses and call links are for members only.
    location: viewer.isMember ? (e.location ?? null) : null,
    link: viewer.isMember ? (e.link ?? null) : null,
    ownerId: e.ownerId,
    hosts,
    rsvps: people,
    myRsvp:
      rsvps.find((r) => r.memberId === viewer.memberId)?.response ?? null,
    canEdit: canEdit(e, viewer.memberId, viewer.isAdmin),
    canTransfer: viewer.isAdmin || e.ownerId === viewer.memberId,
  };
}
export type CalendarEvent = Awaited<ReturnType<typeof hydrate>>;

async function viewerInfo(ctx: QueryCtx) {
  const viewer = await getViewer(ctx);
  const isMember = !!viewer && canEnter(viewer.member, viewer.isAdmin);
  return {
    memberId: isMember ? viewer.member?._id : undefined,
    isMember,
    isAdmin: viewer?.isAdmin ?? false,
  };
}

// Every event, oldest first. Public: signed-out visitors see everything but addresses and links.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await viewerInfo(ctx);
    const events = await ctx.db.query("events").withIndex("by_start").collect();
    return await Promise.all(events.map((e) => hydrate(ctx, e, viewer)));
  },
});

// How members can get the calendar into Google Calendar.
export const calendarInfo = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.member || !canEnter(viewer.member, viewer.isAdmin))
      return null;
    const calendarId = process.env.GOOGLE_CALENDAR_ID ?? null;
    return {
      googleCalendarId: calendarId,
      sharedWith: viewer.member.calendarSharedWith ?? [],
      feedUrl: viewer.member.icsToken
        ? feedUrl(viewer.member.icsToken)
        : null,
    };
  },
});

function feedUrl(token: string) {
  return `${process.env.CONVEX_SITE_URL}/calendar.ics?token=${token}`;
}

// ---------- Writing ----------

type Fields = {
  title: string;
  description?: string;
  location?: string;
  link?: string;
  start: number;
  end: number;
};

function clean(args: {
  title: string;
  description: string;
  location: string;
  link: string;
  start: number;
  end: number;
}): Fields {
  const title = args.title.trim();
  if (!title) throw new ConvexError("Give the session a title.");
  if (title.length > 120) throw new ConvexError("That title is too long.");
  const description = args.description.trim();
  if (description.length > 2000)
    throw new ConvexError("Keep the description under 2,000 characters.");
  const location = args.location.trim();
  if (location.length > 200) throw new ConvexError("That location is too long.");
  let link: string | undefined;
  if (args.link.trim()) {
    link = parseWebsite(args.link) ?? undefined;
    if (!link) throw new ConvexError("The call link should be a web address.");
  }
  if (!(args.end > args.start))
    throw new ConvexError("The end time should be after the start time.");
  if (args.end - args.start > MAX_DURATION)
    throw new ConvexError("Sessions can be at most a week long.");
  return {
    title,
    description: description || undefined,
    location: location || undefined,
    link,
    start: args.start,
    end: args.end,
  };
}

const fieldArgs = {
  title: v.string(),
  description: v.string(),
  location: v.string(),
  link: v.string(),
  start: v.number(),
  end: v.number(),
};

async function committedMember(ctx: QueryCtx, id: Id<"members">) {
  const m = await ctx.db.get(id);
  if (!m || m.bot || m.status !== "committed")
    throw new ConvexError("Hosts have to be committed members.");
  return m;
}

async function editable(ctx: MutationCtx, eventId: Id<"events">) {
  const viewer = await requireMember(ctx);
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("That session doesn’t exist.");
  if (!canEdit(event, viewer.member._id, viewer.isAdmin))
    throw new ConvexError("Only the hosts can change this session.");
  if (event.canceledAt) throw new ConvexError("This session was canceled.");
  return { viewer, event };
}

// "sunday-sprint", or "sunday-sprint-2" if that's taken.
async function uniqueSlug(ctx: QueryCtx, title: string) {
  const base = slugify(title).replace(/^writer$/, "session");
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!taken) return slug;
  }
}

export const eventPath = (e: Doc<"events">) => `/calendar/${e.slug ?? e._id}`;

const syncLater = (ctx: MutationCtx, eventId: Id<"events">) =>
  ctx.scheduler.runAfter(0, internal.gcal.syncEvent, { eventId });

// Any member can propose a session; it goes on the calendar right away, hosted by them.
export const create = mutation({
  args: { ...fieldArgs, cohostIds: v.array(v.id("members")) },
  handler: async (ctx, { cohostIds, ...args }) => {
    const { member } = await requireMember(ctx);
    const fields = clean(args);
    if (fields.start < Date.now() - 3600_000)
      throw new ConvexError("That time has already passed.");
    const cohosts = [...new Set(cohostIds)].filter((id) => id !== member._id);
    for (const id of cohosts) await committedMember(ctx, id);
    const eventId = await ctx.db.insert("events", {
      ...fields,
      slug: await uniqueSlug(ctx, fields.title),
      ownerId: member._id,
      cohostIds: cohosts,
      createdBy: member._id,
    });
    await announce(ctx, eventId, member._id);
    await syncLater(ctx, eventId);
    return (await ctx.db.get(eventId))!.slug!;
  },
});

export const update = mutation({
  args: { eventId: v.id("events"), ...fieldArgs },
  handler: async (ctx, { eventId, ...args }) => {
    const { viewer, event } = await editable(ctx, eventId);
    const fields = clean(args);
    const moved = fields.start !== event.start || fields.end !== event.end;
    const relocated = (fields.location ?? "") !== (event.location ?? "");
    await ctx.db.patch(eventId, {
      ...fields,
      // A new time gets its own 24h reminder.
      ...(fields.start !== event.start ? { remindedAt: undefined } : {}),
    });
    const notes: string[] = [];
    if (moved) notes.push(`Moved to ${fmtWhen(fields.start, fields.end)}.`);
    if (relocated)
      notes.push(
        fields.location
          ? "The location changed. Open the session on the calendar to see it."
          : "The location is now TBD.",
      );
    if (notes.length) await note(ctx, event, viewer.member._id, notes.join(" "));
    await syncLater(ctx, eventId);
  },
});

// Co-hosts can edit the session too. Any host can change the list.
export const setCohosts = mutation({
  args: { eventId: v.id("events"), cohostIds: v.array(v.id("members")) },
  handler: async (ctx, { eventId, cohostIds }) => {
    const { event } = await editable(ctx, eventId);
    const ids = [...new Set(cohostIds)].filter((id) => id !== event.ownerId);
    for (const id of ids) await committedMember(ctx, id);
    await ctx.db.patch(eventId, { cohostIds: ids });
    await syncLater(ctx, eventId);
  },
});

// Hands the session to another member. The previous owner stays on as a co-host.
export const transfer = mutation({
  args: { eventId: v.id("events"), toId: v.id("members") },
  handler: async (ctx, { eventId, toId }) => {
    const { viewer, event } = await editable(ctx, eventId);
    if (!viewer.isAdmin && event.ownerId !== viewer.member._id)
      throw new ConvexError("Only the main host can hand this session off.");
    if (toId === event.ownerId) return;
    const to = await committedMember(ctx, toId);
    const keepPrevious = event.ownerId === viewer.member._id;
    await ctx.db.patch(eventId, {
      ownerId: toId,
      cohostIds: [
        ...event.cohostIds.filter((id) => id !== toId),
        ...(keepPrevious ? [event.ownerId] : []),
      ],
    });
    await note(ctx, event, viewer.member._id, `${to.name} is now hosting.`);
    await syncLater(ctx, eventId);
  },
});

// Removes the viewer from the hosts (co-hosts only; the main host transfers instead).
export const leaveHosts = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const { member } = await requireMember(ctx);
    const event = await ctx.db.get(eventId);
    if (!event?.cohostIds.includes(member._id)) return;
    await ctx.db.patch(eventId, {
      cohostIds: event.cohostIds.filter((id) => id !== member._id),
    });
    await syncLater(ctx, eventId);
  },
});

export const cancel = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const { viewer, event } = await editable(ctx, eventId);
    await ctx.db.patch(eventId, { canceledAt: Date.now() });
    await note(ctx, event, viewer.member._id, "This session is canceled.");
    // Tell everyone who planned to come.
    if (event.end > Date.now()) {
      const to = await attendees(ctx, event, false);
      const when = fmtWhen(event.start, event.end);
      const subject = `Canceled: ${event.title}`;
      const lines = [
        `${event.title} on ${when} is canceled.`,
        `${viewer.member.name} canceled it.`,
      ];
      await ctx.scheduler.runAfter(0, internal.events.sendEmails, {
        emails: to.map((m) => ({ to: m.email, subject, ...render(lines) })),
      });
    }
    await syncLater(ctx, eventId);
  },
});

// RSVP yes, maybe, or no; null clears it. Everyone can see RSVPs.
export const rsvp = mutation({
  args: { eventId: v.id("events"), response: v.union(response, v.null()) },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.kind === "deadline")
      throw new ConvexError("You can’t RSVP to that.");
    if (event.canceledAt) throw new ConvexError("This session was canceled.");
    const existing = await ctx.db
      .query("rsvps")
      .withIndex("by_event_member", (q) =>
        q.eq("eventId", event._id).eq("memberId", member._id),
      )
      .unique();
    if (!args.response) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    const row = { response: args.response, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else
      await ctx.db.insert("rsvps", {
        eventId: event._id,
        memberId: member._id,
        ...row,
      });
  },
});

// Makes (once) the secret token for the viewer's personal iCal feed.
export const makeFeed = mutation({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx);
    if (member.icsToken) return feedUrl(member.icsToken);
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.patch(member._id, { icsToken: token });
    return feedUrl(token);
  },
});

// ---------- #meetups posts ----------

async function meetups(ctx: MutationCtx) {
  return await ctx.db
    .query("channels")
    .withIndex("by_slug", (q) => q.eq("slug", MEETUPS_SLUG))
    .unique();
}

const textDoc = (text: string): RichNode => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function announce(
  ctx: MutationCtx,
  eventId: Id<"events">,
  authorId: Id<"members">,
) {
  const channel = await meetups(ctx);
  const event = await ctx.db.get(eventId);
  if (!channel || !event) return;
  const messageId = await postMessage(ctx, {
    channelId: channel._id,
    authorId,
    body: JSON.stringify({ type: "doc", content: [] }),
    text: `scheduled “${event.title}”`,
    eventId,
  });
  await ctx.db.patch(eventId, { announcementId: messageId });
}

// Posts a change as a reply under the session's #meetups announcement.
async function note(
  ctx: MutationCtx,
  event: Doc<"events">,
  authorId: Id<"members">,
  text: string,
) {
  if (!event.announcementId) return;
  const parent = await ctx.db.get(event.announcementId);
  if (!parent) return;
  await ctx.db.patch(parent._id, {
    replyCount: (parent.replyCount ?? 0) + 1,
    lastReplyAt: Date.now(),
    replierIds: [
      authorId,
      ...(parent.replierIds ?? []).filter((id) => id !== authorId),
    ].slice(0, 3),
  });
  await postMessage(ctx, {
    channelId: parent.channelId,
    authorId,
    body: JSON.stringify(textDoc(text)),
    text,
    parentId: parent._id,
  });
}

// ---------- Emails ----------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Plain email: one paragraph per line, links made clickable.
function render(lines: string[]) {
  const text = lines.join("\n\n");
  const html = `<div style="font-family:Georgia,serif;font-size:17px;line-height:1.5;color:#38213f;background:#f9eeec;padding:28px">${lines
    .map(
      (l) =>
        `<p style="margin:0 0 14px">${esc(l).replace(
          /(https?:\/\/\S+)/g,
          '<a href="$1" style="color:#9c443a">$1</a>',
        )}</p>`,
    )
    .join("")}</div>`;
  return { text, html };
}

// Hosts plus everyone who said yes or maybe (deduped), with their RSVP.
async function attendees(
  ctx: QueryCtx,
  event: Doc<"events">,
  includeHosts: boolean,
) {
  const out = new Map<
    Id<"members">,
    { email: string; name: string; role: "host" | "yes" | "maybe" }
  >();
  if (includeHosts)
    for (const id of [event.ownerId, ...event.cohostIds]) {
      const m = await ctx.db.get(id);
      if (m && !m.bot) out.set(id, { email: m.email, name: m.name, role: "host" });
    }
  const rsvps = await ctx.db
    .query("rsvps")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();
  for (const r of rsvps) {
    if (r.response === "no" || out.has(r.memberId)) continue;
    const m = await ctx.db.get(r.memberId);
    if (m && !m.bot)
      out.set(r.memberId, { email: m.email, name: m.name, role: r.response });
  }
  return [...out.values()];
}

export const sendEmails = internalAction({
  args: {
    emails: v.array(
      v.object({
        to: v.string(),
        subject: v.string(),
        text: v.string(),
        html: v.string(),
      }),
    ),
  },
  handler: async (_ctx, { emails }) => {
    for (const e of emails) {
      try {
        await sendEmail(e);
      } catch (err) {
        console.error(`email to ${e.to} failed`, err);
      }
    }
  },
});

// Every 15 minutes (crons.ts): sessions starting 20–24 hours from now that haven't had
// their reminder yet. Marks them first, so a retry never sends twice.
export const claimReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("events")
      .withIndex("by_start", (q) =>
        q.gt("start", now + 20 * 3600_000).lte("start", now + 24 * 3600_000),
      )
      .collect();
    const site = SITE;
    const emails = [];
    for (const e of due) {
      if (e.remindedAt || e.canceledAt || e.kind === "deadline") continue;
      await ctx.db.patch(e._id, { remindedAt: now });
      const people = await attendees(ctx, e, true);
      const going = people.filter((p) => p.role === "yes").length;
      const maybe = people.filter((p) => p.role === "maybe").length;
      for (const p of people) {
        const lines = [
          `${e.title} is tomorrow: ${fmtWhen(e.start, e.end)}.`,
          e.location ? `Where: ${e.location}` : "Where: TBD",
          ...(e.link ? [`Call link: ${e.link}`] : []),
          ...(e.description ? [e.description] : []),
          p.role === "host"
            ? `You’re hosting. So far ${going} going, ${maybe} maybe.`
            : `You said ${p.role === "yes" ? "you’re going" : "maybe"}. Change your RSVP: ${site}${eventPath(e)}`,
        ];
        emails.push({
          to: p.email,
          subject: `Tomorrow: ${e.title}`,
          ...render(lines),
        });
      }
    }
    if (emails.length)
      await ctx.scheduler.runAfter(0, internal.events.sendEmails, { emails });
  },
});

// ---------- Google Calendar and iCal ----------

// What convex/gcal.ts and the iCal feed need to write an event.
export async function exportable(ctx: QueryCtx, e: Doc<"events">) {
  const site = SITE;
  const names = [];
  for (const id of [e.ownerId, ...e.cohostIds]) {
    const m = await ctx.db.get(id);
    if (m) names.push(m.name);
  }
  const url = `${site}${eventPath(e)}`;
  const description = [
    e.description,
    e.kind === "deadline" ? null : `Hosted by ${names.join(", ")}`,
    e.link ? `Call link: ${e.link}` : null,
    e.kind === "deadline" ? `${site}/home` : `RSVP: ${url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    id: e._id as string,
    title: e.title,
    description,
    location: e.location ?? e.link ?? "",
    start: e.start,
    end: e.end,
    canceled: !!e.canceledAt,
    url,
  };
}

export const forSync = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const e = await ctx.db.get(eventId);
    return e ? await exportable(ctx, e) : null;
  },
});

export const allIds = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("events").collect()).map((e) => e._id),
});

// The emails a member signs in with, and which ones the Google calendar is already shared with.
export const shareTargets = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const m = await ctx.db.get(memberId);
    if (!m || m.bot || !canEnter(m, false)) return null;
    const emails = [m.email, m.altEmail].filter((e): e is string => !!e);
    const done = new Set(m.calendarSharedWith ?? []);
    return emails.filter((e) => !done.has(e));
  },
});

export const markShared = internalMutation({
  args: { memberId: v.id("members"), email: v.string() },
  handler: async (ctx, { memberId, email }) => {
    const m = await ctx.db.get(memberId);
    if (!m) return;
    const list = new Set(m.calendarSharedWith ?? []);
    list.add(email);
    await ctx.db.patch(memberId, { calendarSharedWith: [...list] });
  },
});

export const committedIds = internalQuery({
  args: {},
  handler: async (ctx) =>
    (
      await ctx.db
        .query("members")
        .withIndex("by_status", (q) => q.eq("status", "committed"))
        .collect()
    )
      .filter((m) => !m.bot)
      .map((m) => m._id),
});

// The iCal feed (convex/http.ts): everything on the calendar, for one member's secret token.
export const feed = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token) return null;
    const m = await ctx.db
      .query("members")
      .withIndex("by_icsToken", (q) => q.eq("icsToken", token))
      .unique();
    if (!m || !canEnter(m, false)) return null;
    const events = await ctx.db.query("events").withIndex("by_start").collect();
    return await Promise.all(events.map((e) => exportable(ctx, e)));
  },
});

// ---------- Setup ----------

// Admins can post the deadline reminders and starter sessions. Run once:
//   bunx convex run events:seed '{"hostEmail": "..."}'
// Skips anything already on the calendar with the same title and start.
export const seed = internalMutation({
  args: { hostEmail: v.string() },
  handler: async (ctx, { hostEmail }) => {
    const host = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", hostEmail.toLowerCase()))
      .unique();
    if (!host) throw new ConvexError(`No member with email ${hostEmail}.`);
    const rows = starterEvents();
    const existing = await ctx.db.query("events").collect();
    let added = 0;
    for (const r of rows) {
      if (existing.some((e) => e.title === r.title && e.start === r.start))
        continue;
      const id = await ctx.db.insert("events", {
        ...r,
        ownerId: host._id,
        cohostIds: [],
        createdBy: host._id,
      });
      await syncLater(ctx, id);
      added++;
    }
    return { added };
  },
});

// The starter events: SF circles on the Saturday of each week, and the Monday deadlines.
function starterEvents(): (Fields & { slug: string; kind?: "deadline" })[] {
  const home = "41 Dolores Ter, San Francisco";
  return [
    ...[7, 14, 21, 28].map((d, i) => ({
      title: `SF circle, week ${i + 1}`,
      slug: `sf-circle-${i + 1}`,
      description: "Two hours of writing. Bring a laptop.",
      location: d === 28 ? undefined : home,
      start: ptToUtc(2026, 11, d, 10),
      end: ptToUtc(2026, 11, d, 12),
    })),
    ...[9, 16, 23, 30].map((d, i) => ({
      title: `Essay ${i + 1} due`,
      slug: `essay-${i + 1}-due`,
      description: "Publish your essay and add it on Home by 9pm PT.",
      start: ptToUtc(2026, 11, d, 20, 45),
      end: ptToUtc(2026, 11, d, 21),
      kind: "deadline" as const,
    })),
  ];
}

// Gives the starter events (matched by start time) their names and slugs, and every
// other event a slug. Run once: bunx convex run events:nameEvents
export const nameEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const starters = starterEvents();
    let named = 0;
    for (const e of await ctx.db.query("events").withIndex("by_start").collect()) {
      const s = starters.find(
        (x) => x.start === e.start && !!x.kind === (e.kind === "deadline"),
      );
      if (s) {
        await ctx.db.patch(e._id, {
          title: s.title,
          slug: s.slug,
          description: s.description,
        });
      } else if (!e.slug) {
        await ctx.db.patch(e._id, { slug: await uniqueSlug(ctx, e.title) });
      } else continue;
      await syncLater(ctx, e._id);
      named++;
    }
    return { named };
  },
});

// Lets admins re-run the Google sync for everything from the dashboard if needed.
export const resyncAll = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.gcal.syncAll, {});
  },
});
