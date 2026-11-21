// The /zine order sandbox reports here while it renders (lib/zine/fulfill.ts#onReport),
// guarded by the order's one-time key.
import { onReport } from "@/lib/zine/fulfill";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { print?: unknown } | null;
  if (!body?.print || typeof body.print !== "object")
    return new Response("Bad request", { status: 400 });
  try {
    return Response.json(await onReport(body.print));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("zine print report failed", err);
    return new Response("Error", { status: 500 });
  }
}
