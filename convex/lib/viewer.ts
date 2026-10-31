import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

type Ctx = QueryCtx | MutationCtx;

export function isAdminEmail(email: string) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

// The signed-in Better Auth user and their member row (matched by email), if any.
export async function getViewer(ctx: Ctx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  const email = user.email.toLowerCase();
  const member = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return { user, email, member, isAdmin: isAdminEmail(email) };
}

// Committed members (and admins) can use the portal.
export function canEnter(member: Doc<"members"> | null, isAdmin: boolean) {
  return isAdmin || member?.status === "committed";
}

// Throws unless the viewer is a committed member (or an admin with a member row).
export async function requireMember(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Please sign in.");
  if (!viewer.member || !canEnter(viewer.member, viewer.isAdmin)) {
    throw new ConvexError("Only committed members can do that.");
  }
  return { ...viewer, member: viewer.member };
}

export async function requireAdmin(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  if (!viewer?.isAdmin) throw new ConvexError("Admins only.");
  return viewer;
}

// Checks the shared secret that Next.js server code passes to server-only functions.
export function checkServerSecret(secret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || secret !== expected)
    throw new ConvexError("Bad server secret.");
}

// Public-safe fields of a member, for directories, chat authors, etc.
export function publicMember(m: Doc<"members">) {
  return {
    _id: m._id,
    name: m.name,
    handle: m.handle ?? null,
    link: m.link ?? null,
    bio: m.bio ?? null,
    image: m.image ?? null,
    committedAt: m.committedAt ?? null,
  };
}
export type PublicMember = ReturnType<typeof publicMember>;
