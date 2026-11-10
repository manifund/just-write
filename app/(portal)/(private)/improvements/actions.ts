"use server";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthQuery, serverSecret } from "@/lib/auth-server";
import { closePr, mergePr, revertPr } from "@/lib/github";

type Result = { ok: true } | { ok: false; error: string };
type Patch = NonNullable<
  FunctionArgs<typeof api.server.reportImprovement>["patch"]
>;

// Admin buttons on Claude's PR cards. Each checks the viewer is an admin (in forAdmin),
// calls GitHub, then records the outcome on the run so every card updates live.
async function act(
  id: string,
  run: (r: {
    prNumber: number;
    branch: string;
    token: string;
  }) => Promise<Patch>,
  allowed: string[],
): Promise<Result> {
  try {
    const r = await fetchAuthQuery(api.improvements.forAdmin, {
      id: id as Id<"improvements">,
    });
    if (!r?.prNumber || !allowed.includes(r.status))
      return { ok: false, error: "That change can’t do this right now." };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { ok: false, error: "GITHUB_TOKEN isn’t set." };
    const patch = await run({ prNumber: r.prNumber, branch: r.branch, token });
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.mutation(api.server.reportImprovement, {
      secret: serverSecret(),
      id: id as Id<"improvements">,
      patch: { ...patch, decidedBy: r.adminId ?? undefined },
    });
    return { ok: true };
  } catch (err) {
    console.error("improvement action failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : "Failed.",
    };
  }
}

export async function mergeImprovement(id: string) {
  return act(
    id,
    async ({ prNumber, branch, token }) => {
      await mergePr(token, prNumber, branch);
      return { status: "merged" };
    },
    ["pr"],
  );
}

export async function closeImprovement(id: string) {
  return act(
    id,
    async ({ prNumber, branch, token }) => {
      await closePr(token, prNumber, branch);
      return { status: "closed" };
    },
    ["pr"],
  );
}

export async function revertImprovement(id: string) {
  return act(
    id,
    async ({ prNumber, token }) => ({
      revertPrUrl: await revertPr(token, prNumber),
    }),
    ["merged"],
  );
}
