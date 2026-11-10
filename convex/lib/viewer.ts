import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

type Ctx = QueryCtx | MutationCtx;

export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  return adminEmails().includes(email.toLowerCase());
}

// Read-only sessions come from preview links (convex/previewAccess.ts): they can see
// everything their user can, but every mutation that checks the viewer refuses them.
// The flag is a claim in the session's JWT (see definePayload in convex/auth.ts).
export async function isReadonly(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.readonly === true;
}

const isMutation = (ctx: Ctx): ctx is MutationCtx => "insert" in ctx.db;

function refuseReadonlyWrites(ctx: Ctx, readonly: boolean) {
  if (readonly && isMutation(ctx))
    throw new ConvexError(
      "This is a read-only preview, so changes aren’t saved.",
    );
}

// The member row for an address: its primary email, or an alternate sign-in address.
export async function memberByEmail(ctx: Ctx, email: string) {
  const primary = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (primary) return primary;
  return await ctx.db
    .query("members")
    .withIndex("by_altEmail", (q) => q.eq("altEmail", email))
    .unique();
}

// The signed-in Better Auth user and their member row (matched by email), if any.
export async function getViewer(ctx: Ctx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  const readonly = await isReadonly(ctx);
  const email = user.email.toLowerCase();
  const member = await memberByEmail(ctx, email);
  // Nobody signs in as the bot (its address can't receive mail), but never let them act as it.
  if (member?.bot)
    return { user, email, member: null, isAdmin: false, readonly };
  return { user, email, member, isAdmin: isAdminEmail(email), readonly };
}

// Committed members (and admins) can use the portal.
export function canEnter(member: Doc<"members"> | null, isAdmin: boolean) {
  return isAdmin || member?.status === "committed";
}

// Throws unless the viewer is a committed member (or an admin with a member row).
// In mutations it also refuses read-only sessions, unless `allowReadonly` (for harmless
// background writes like presence).
export async function requireMember(
  ctx: Ctx,
  { allowReadonly = false }: { allowReadonly?: boolean } = {},
) {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Please sign in.");
  if (!allowReadonly) refuseReadonlyWrites(ctx, viewer.readonly);
  if (!viewer.member || !canEnter(viewer.member, viewer.isAdmin)) {
    throw new ConvexError("Only committed members can do that.");
  }
  return { ...viewer, member: viewer.member };
}

export async function requireAdmin(ctx: Ctx) {
  const viewer = await getViewer(ctx);
  if (!viewer?.isAdmin) throw new ConvexError("Admins only.");
  refuseReadonlyWrites(ctx, viewer.readonly);
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
    bot: m.bot ?? false,
  };
}
export type PublicMember = ReturnType<typeof publicMember>;
