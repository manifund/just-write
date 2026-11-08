import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  adminEmails,
  canEnter,
  getViewer,
  isAdminEmail,
  memberByEmail,
  publicMember,
  requireMember,
} from "./lib/viewer";
import { getClaude } from "./lib/claude";
import { CHECK_IN_SLUG } from "./lib/channels";
import {
  PROGRAM_START,
  SIGNUPS_CLOSE,
  SIGNUPS_CLOSED_MESSAGE,
} from "./lib/program";
import { ptDayKey } from "./lib/time";
import { EMAIL_RE, HANDLE_RE, parseWebsite, slugify } from "./lib/util";

// Picks an unused handle based on the name: "kit-when", then "kit-when-2", ...
async function uniqueHandle(
  ctx: MutationCtx,
  name: string,
  self?: Id<"members">,
) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await ctx.db
      .query("members")
      .withIndex("by_handle", (q) => q.eq("handle", candidate))
      .first();
    if (!taken || taken._id === self) return candidate;
  }
}

// Who's signed in, and whether they can enter the portal.
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const { user, member, isAdmin } = viewer;
    return {
      user: { name: user.name, email: viewer.email, image: user.image ?? null },
      member: member
        ? {
            ...publicMember(member),
            status: member.status,
            email: member.email,
            notify: member.notify ?? "mentions",
          }
        : null,
      isAdmin,
      canEnter: canEnter(member, isAdmin),
      readonly: viewer.readonly,
    };
  },
});

// Called when a signed-in viewer opens the portal: fills in their avatar and handle.
// Admins without a row get one, so they can post in chat.
export const syncProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer || viewer.readonly) return null;
    let member = viewer.member;
    if (!member) {
      if (!viewer.isAdmin) return null;
      const id = await ctx.db.insert("members", {
        name: viewer.user.name || viewer.email.split("@")[0],
        email: viewer.email,
        status: "interested",
      });
      member = (await ctx.db.get(id))!;
    }
    const patch: { image?: string; handle?: string } = {};
    if (!member.image && viewer.user.image) patch.image = viewer.user.image;
    if (!member.handle)
      patch.handle = await uniqueHandle(ctx, member.name, member._id);
    if (Object.keys(patch).length) await ctx.db.patch(member._id, patch);
    return member._id;
  },
});

// Landing page "Express interest" form. Resubmitting with the same email updates the row.
export const expressInterest = mutation({
  args: { name: v.string(), email: v.string(), website: v.string() },
  handler: async (ctx, args) => {
    if (Date.now() >= SIGNUPS_CLOSE)
      throw new ConvexError(SIGNUPS_CLOSED_MESSAGE);
    const name = args.name.trim().slice(0, 200);
    const email = args.email.trim().toLowerCase().slice(0, 320);
    const link = parseWebsite(args.website);
    if (!name) throw new ConvexError("Please add your name.");
    if (!EMAIL_RE.test(email))
      throw new ConvexError("Please add a valid email.");
    if (!link) throw new ConvexError("Please add a valid website link.");

    const existing = await memberByEmail(ctx, email);
    if (existing) await ctx.db.patch(existing._id, { name, link });
    else
      await ctx.db.insert("members", {
        name,
        email,
        link,
        status: "interested",
      });
    return { name };
  },
});

// The landing page's "Committed" / "Interested" rows.
export const interestedList = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("members").collect();
    return rows
      .filter((m) => !m.bot)
      .map((m) => ({
        _id: m._id,
        name: m.name,
        link: m.link ?? null,
        committed: m.status === "committed",
        sortKey: m.committedAt ?? m.legacyCreatedAt ?? m._creationTime,
      }))
      .sort((a, b) => a.sortKey - b.sortKey);
  },
});

// /commit: records the signed-in viewer's typed signature. The server action then opens Stripe Checkout.
export const signTerms = mutation({
  args: { signature: v.string() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new ConvexError("Please sign in first.");
    if (viewer.readonly)
      throw new ConvexError(
        "This is a read-only preview, so changes aren’t saved.",
      );
    const signature = args.signature.trim().replace(/\s+/g, " ").slice(0, 200);
    if (!signature)
      throw new ConvexError("Please type your full name to sign.");

    const { member, email } = viewer;
    if (member?.status === "committed") {
      return { memberId: member._id, email, alreadyCommitted: true };
    }
    const now = Date.now();
    if (now >= SIGNUPS_CLOSE) throw new ConvexError(SIGNUPS_CLOSED_MESSAGE);
    if (member) {
      await ctx.db.patch(member._id, {
        signedName: signature,
        signedAt: now,
        status: "signed",
      });
      return { memberId: member._id, email, alreadyCommitted: false };
    }
    const memberId = await ctx.db.insert("members", {
      name: viewer.user.name || signature,
      email,
      image: viewer.user.image ?? undefined,
      status: "signed",
      signedName: signature,
      signedAt: now,
    });
    return { memberId, email, alreadyCommitted: false };
  },
});

// /members: the public directory of committed writers, with essay counts.
export const directory = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "committed"))
      .collect();
    const out = await Promise.all(
      rows.map(async (m) => {
        const essays = await ctx.db
          .query("essays")
          .withIndex("by_member", (q) => q.eq("memberId", m._id))
          .collect();
        const visible = essays.filter((e) => e.review !== "rejected");
        const latest = visible.sort((a, b) => b.submittedAt - a.submittedAt)[0];
        return {
          ...publicMember(m),
          essayCount: visible.length,
          latestEssay: latest ? { title: latest.title, url: latest.url } : null,
        };
      }),
    );
    return out.sort((a, b) => (a.committedAt ?? 0) - (b.committedAt ?? 0));
  },
});

// /members: the Pacific days each member posted a top-level check-in since `since` (the
// start of the current week, from the client so this query doesn't depend on the clock).
// Only counts days, never the check-ins' text, which stays behind the #check-ins gate.
export const checkInDays = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_slug", (q) => q.eq("slug", CHECK_IN_SLUG))
      .unique();
    if (!channel) return {};
    const posts = await ctx.db
      .query("messages")
      .withIndex("by_channel_parent", (q) =>
        q
          .eq("channelId", channel._id)
          .eq("parentId", undefined)
          .gte("_creationTime", Math.max(since, PROGRAM_START)),
      )
      .collect();
    const days: Record<string, string[]> = {};
    for (const m of posts) {
      const key = ptDayKey(m._creationTime);
      const list = (days[m.authorId] ??= []);
      if (!list.includes(key)) list.push(key);
    }
    return days;
  },
});

// /members/[handle]: a committed member's public profile and essays.
export const profile = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const m = await ctx.db
      .query("members")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .unique();
    if (!m || m.status !== "committed") return null;
    const essays = (
      await ctx.db
        .query("essays")
        .withIndex("by_member", (q) => q.eq("memberId", m._id))
        .collect()
    )
      .filter((e) => e.review !== "rejected")
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((e) => ({
        _id: e._id,
        title: e.title,
        url: e.url,
        wordCount: e.wordCount ?? null,
        submittedAt: e.submittedAt,
      }));
    return { member: publicMember(m), essays };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    link: v.string(),
    bio: v.string(),
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx);
    const name = args.name.trim().slice(0, 120);
    if (!name) throw new ConvexError("Please add your name.");
    const link = args.link.trim() ? parseWebsite(args.link) : null;
    if (args.link.trim() && !link)
      throw new ConvexError("That website link doesn’t look right.");
    const bio = args.bio.trim().slice(0, 600);
    const handle = args.handle.trim().toLowerCase();
    if (!HANDLE_RE.test(handle)) {
      throw new ConvexError(
        "Handles use lowercase letters, numbers, and dashes (up to 40).",
      );
    }
    const taken = await ctx.db
      .query("members")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .first();
    if (taken && taken._id !== member._id)
      throw new ConvexError("That handle is taken.");

    await ctx.db.patch(member._id, {
      name,
      link: link ?? undefined,
      bio: bio || undefined,
      handle,
    });
    return handle;
  },
});

// Lets a second address sign in as an existing member (for an admin with two accounts).
// Internal, so only the CLI can call it:
//   bunx convex run members:setAltEmail '{"email":"...","altEmail":"..."}'
// Pass altEmail: null to remove it.
export const setAltEmail = internalMutation({
  args: { email: v.string(), altEmail: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!member) throw new ConvexError(`No member with email ${email}.`);
    if (args.altEmail === null) {
      await ctx.db.patch(member._id, { altEmail: undefined });
      return { email, altEmail: null };
    }
    const altEmail = args.altEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(altEmail) || altEmail === email)
      throw new ConvexError("Please pass a different, valid email.");
    const taken = await memberByEmail(ctx, altEmail);
    if (taken && taken._id !== member._id)
      throw new ConvexError(`${altEmail} already belongs to ${taken.name}.`);
    await ctx.db.patch(member._id, { altEmail });
    await ctx.scheduler.runAfter(0, internal.gcal.shareWith, {
      memberId: member._id,
    });
    return { email, altEmail };
  },
});

// Folds a duplicate row (someone who expressed interest again under a second address) into
// their real row: the duplicate is deleted and its address becomes the altEmail, so signing in
// with either address reaches the same account. Only rows that never entered the portal can be
// merged away, so nothing else can point at them. Internal, so only the CLI can call it:
//   bunx convex run members:merge '{"into":"kept@...","from":"duplicate@..."}'
export const merge = internalMutation({
  args: { into: v.string(), from: v.string() },
  handler: async (ctx, args) => {
    const byEmail = (email: string) =>
      ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
    const into = await byEmail(args.into.trim().toLowerCase());
    const from = await byEmail(args.from.trim().toLowerCase());
    if (!into || !from) throw new ConvexError("Both emails must be members.");
    if (into._id === from._id) throw new ConvexError("Those are the same row.");
    if (
      from.status === "committed" ||
      isAdminEmail(from.email) ||
      from.stripeSessionId
    )
      throw new ConvexError(
        `${from.email} can use the portal or has started paying; merge the other way, or by hand.`,
      );
    if (into.altEmail)
      throw new ConvexError(`${into.email} already has an alternate address.`);
    await ctx.db.delete(from._id);
    await ctx.db.patch(into._id, {
      altEmail: from.email,
      // Keep profile bits the kept row doesn't have yet.
      link: into.link ?? from.link,
      bio: into.bio ?? from.bio,
      legacyId: into.legacyId ?? from.legacyId,
    });
    await ctx.scheduler.runAfter(0, internal.gcal.shareWith, {
      memberId: into._id,
    });
    return { kept: into.email, altEmail: from.email, deleted: from._id };
  },
});

// Every committed member's public card, for resolving chat authors and presence avatars.
export const roster = query({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
    const rows = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "committed"))
      .collect();
    // Admins may not be committed but still post, and Claude (the bot) posts too. Looked
    // up by email so this never reads the whole table (every member subscribes to it).
    const others = [];
    for (const email of adminEmails()) {
      const m = await memberByEmail(ctx, email);
      if (m && m.status !== "committed") others.push(m);
    }
    const claude = await getClaude(ctx);
    if (claude && claude.status !== "committed") others.push(claude);
    return [...rows, ...others].map(publicMember);
  },
});

// Profile photo upload: the client gets a URL, uploads a resized image, then calls setAvatar.
export const avatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const { member } = await requireMember(ctx);
    const file = await ctx.db.system.get(storageId);
    if (
      !file ||
      !file.contentType?.startsWith("image/") ||
      file.size > MAX_AVATAR_BYTES
    ) {
      if (file) await ctx.storage.delete(storageId);
      throw new ConvexError("Please upload an image under 2 MB.");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new ConvexError("Upload failed. Please try again.");
    if (member.imageStorageId && member.imageStorageId !== storageId)
      await ctx.storage.delete(member.imageStorageId);
    await ctx.db.patch(member._id, { image: url, imageStorageId: storageId });
  },
});

// /settings: the viewer's email preferences (kept out of publicMember, which others can see).
export const emailPrefs = query({
  args: {},
  handler: async (ctx) => {
    const { member } = await requireMember(ctx, { allowReadonly: true });
    return { checkInReminders: member.checkInReminders ?? false };
  },
});

export const setCheckInReminders = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const { member } = await requireMember(ctx);
    await ctx.db.patch(member._id, { checkInReminders: on || undefined });
  },
});
