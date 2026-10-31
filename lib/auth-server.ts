import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

// Server-side helpers that call Convex as the signed-in user (via the Better Auth cookie).
export const {
  handler,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});

// Shared secret for the server-only functions in convex/server.ts.
export function serverSecret() {
  const s = process.env.CONVEX_SERVER_SECRET;
  if (!s) throw new Error("CONVEX_SERVER_SECRET is not set");
  return s;
}
