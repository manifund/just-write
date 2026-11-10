// Keeps open @Claude PRs up to date with main, so they don't drift into conflicts while they
// wait for review. Runs after every merge we make (lib/improve-finish.ts, the admin Merge
// button) and from a Convex cron (app/api/improve/sync), which catches merges done on GitHub.
//
// For each open claude/* PR that's behind main, GitHub's update-branch merges main in with a
// real merge commit. PRs with a code run queued or running in their thread are skipped
// (convex/prSync.ts): finishRun refuses to push if the branch moved under it. A PR that
// can't be updated because it conflicts gets a note on its card; nothing starts on its own,
// and an admin's Merge has Claude fix the conflicts (server.fixConflicts).
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { serverSecret } from "@/lib/auth-server";
import {
  behindMain,
  getPr,
  openPrsFrom,
  updateBranch,
} from "@/lib/github";

export type SyncReport = {
  updated: number[];
  conflicts: number[];
  skipped: number[];
};

// Whether a failed update-branch (or a PR fetched after it) means the PR conflicts with main,
// rather than something passing like the head moving.
export function isConflict(err: unknown, mergeable: boolean | null) {
  return mergeable === false || /conflict/i.test(String(err));
}

export async function syncOpenPrs(): Promise<SyncReport> {
  const report: SyncReport = { updated: [], conflicts: [], skipped: [] };
  const token = process.env.GITHUB_TOKEN;
  if (!token) return report;
  const prs = await openPrsFrom(token, "claude/");
  if (!prs.length) return report;
  const secret = serverSecret();
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  // One at a time: each update is a push, and GitHub limits how fast those can come.
  for (const pr of prs) {
    const { id, busy } = await convex.query(api.prSync.prState, {
      secret,
      prNumber: pr.number,
    });
    if (busy) {
      report.skipped.push(pr.number);
      continue;
    }
    const mark = async (conflicts: boolean) => {
      if (id)
        await convex.mutation(api.prSync.markConflicts, {
          secret,
          id,
          conflicts,
        });
    };
    try {
      if ((await behindMain(token, pr.head)) > 0) {
        await updateBranch(token, pr.number, pr.head);
        report.updated.push(pr.number);
      }
      await mark(false);
    } catch (err) {
      const after = await getPr(token, pr.number).catch(() => null);
      if (isConflict(err, after?.mergeable ?? null)) {
        report.conflicts.push(pr.number);
        await mark(true);
      } else {
        console.error(`couldn’t update PR #${pr.number}`, err);
        report.skipped.push(pr.number);
      }
    }
  }
  return report;
}

// For after(): a failed sync shouldn't fail the merge that triggered it.
export async function syncOpenPrsQuietly() {
  try {
    const r = await syncOpenPrs();
    if (r.updated.length || r.conflicts.length) console.log("PR sync", r);
  } catch (err) {
    console.error("PR sync failed", err);
  }
}
