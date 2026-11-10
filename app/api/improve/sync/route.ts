// Merges main into open @Claude PRs (lib/improve-sync.ts). A Convex cron calls this
// (convex/prSync.ts#sweep), guarded by CONVEX_SERVER_SECRET, to catch merges done on GitHub;
// our own merges run the same sync right after they happen.
import { serverSecret } from "@/lib/auth-server";
import { syncOpenPrs } from "@/lib/improve-sync";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { secret?: string } | null;
  if (!body || body.secret !== serverSecret())
    return new Response("Forbidden", { status: 403 });
  return Response.json(await syncOpenPrs());
}
