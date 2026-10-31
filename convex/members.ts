import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  canEnter,
  getViewer,
  isAdminEmail,
  publicMember,
  requireMember,
} from "./lib/viewer";
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
          }
        : null,
      isAdmin,
      canEnter: canEnter(member, isAdmin),
    };
  },
});

// Called when a signed-in viewer opens the portal: fills in their avatar and handle.
// Admins without a row get one, so they can post in chat.
export const syncProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
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
    const name = args.name.trim().slice(0, 200);
    const email = args.email.trim().toLowerCase().slice(0, 320);
    const link = parseWebsite(args.website);
    if (!name) throw new ConvexError("Please add your name.");
    if (!EMAIL_RE.test(email))
      throw new ConvexError("Please add a valid email.");
    if (!link) throw new ConvexError("Please add a valid website link.");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
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
    const signature = args.signature.trim().replace(/\s+/g, " ").slice(0, 200);
    if (!signature)
      throw new ConvexError("Please type your full name to sign.");

    const { member, email } = viewer;
    if (member?.status === "committed") {
      return { memberId: member._id, email, alreadyCommitted: true };
    }
    const now = Date.now();
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

// Every committed member's public card, for resolving chat authors and presence avatars.
export const roster = query({
  args: {},
  handler: async (ctx) => {
    await requireMember(ctx);
    const rows = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "committed"))
      .collect();
    // Admins may not be committed but still post.
    const admins = (await ctx.db.query("members").collect()).filter(
      (m) => m.status !== "committed" && isAdminEmail(m.email),
    );
    return [...rows, ...admins].map(publicMember);
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
