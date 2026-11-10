// The Preview button on Claude's card. Makes a one-time read-only link for the signed-in
// member (convex/previewAccess.ts) and sends them to the preview deployment with it, so
// they see the change as themselves without signing in there.
import { randomBytes } from "node:crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const here = new URL(req.url);
  if (!(await isAuthenticated()))
    return Response.redirect(
      new URL(`/sign-in?next=${encodeURIComponent(here.pathname)}`, here),
    );
  try {
    const url = await fetchAuthMutation(api.previewAccess.create, {
      id: id as Id<"improvements">,
      token: randomBytes(32).toString("base64url"),
    });
    return new Response(null, {
      status: 303,
      headers: { location: url, "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("preview link failed", id, err);
    return new Response("This preview isn’t available.", { status: 404 });
  }
}
