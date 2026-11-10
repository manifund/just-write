// The run's brief and settings, read from the environment when the runner starts
// (scripts/improve-runner.ts).
import { existsSync, readFileSync } from "node:fs";
import { SANDBOX_ROOT, isEffort } from "../../convex/lib/improve";

export type Brief = {
  number: number;
  kind?: "chat" | null;
  branch: string;
  prNumber: number | null;
  resumeSessionId: string | null;
  // The thread's open PRs from earlier runs. The route picked which one (if any) this
  // continues before starting the sandbox (lib/improve-target.ts).
  openPrs?: { run: number; prNumber: number; title: string }[];
  // Set when this picks up an earlier run in the thread that stopped partway (out of steps,
  // timed out). Its saved sandbox, if it came back, still has that run's uncommitted edits.
  resumesFailedRun?: number | null;
  // "@Claude !restart": start run `run` over with a fresh session, redoing `request`, with
  // `note` (what followed the command) as extra direction.
  restart?: { run: number; request: string; note: string } | null;
  // Code runs: other threads' open PRs and latest merges, newest first
  // (convex/server.ts#otherWork). `at` is when that run finished.
  otherWork?: { open: OtherPr[]; merged: OtherPr[] } | null;
  // Resolved in Convex: the request's "effort: high", or the effort of the run this continues.
  effort?: string | null;
  request: string;
  untagged?: boolean; // the request didn't mention @Claude (convex/untagged.ts)
  requester: string;
  channel: string;
  threadUrl: string;
  // `images`: URLs of the images in that message (convex/server.ts#claimImprovement).
  thread: { author: string; text: string; at: number; images?: string[] }[];
};

export type OtherPr = {
  prNumber: number;
  run: number;
  branch: string;
  title: string;
  requester: string;
  channel: string;
  at: number;
  files: string[];
  moreFiles: number;
  conflictsWithMain: boolean;
};

export const env = process.env;
export const DRY = env.IMPROVE_DRY_RUN === "1";
export const ROOT = env.IMPROVE_ROOT ?? SANDBOX_ROOT;
export const brief: Brief = JSON.parse(
  readFileSync(env.IMPROVE_BRIEF ?? "/tmp/brief.json", "utf8"),
);
export const RUN_TOKEN = env.RUN_TOKEN ?? "";
export const CHAT = brief.kind === "chat";
// Chat tasks: where the route installed the Agent SDK and wrote the club's data
// (lib/chat-task-sandbox.ts, lib/club-snapshot.ts). Their sandbox stops 25 minutes after
// it starts, so the agent gets 15.
export const AGENT_DIR = "/tmp/agent";
export const CLUB_DIR = "/tmp/club";
export const CHAT_AGENT_MS = 15 * 60 * 1000;
export const startedAt = Date.now();
// The firewall in front of a chat task decrypts model API requests to add the key, so make
// sure Node and Bun trust the system's certificates, where its certificate would be.
if (CHAT && !env.NODE_EXTRA_CA_CERTS)
  for (const f of [
    "/etc/pki/tls/certs/ca-bundle.crt",
    "/etc/ssl/certs/ca-certificates.crt",
  ])
    if (existsSync(f)) {
      env.NODE_EXTRA_CA_CERTS = f;
      break;
    }

// The agent's effort level (convex/lib/improve.ts#parseEffort). Without one, the SDK uses
// the model's default.
export const EFFORT = isEffort(brief.effort) ? brief.effort : undefined;
export const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY ?? "";
// The saved sandbox from the last run on this branch came back (not a fresh clone).
export const RESUMED_SANDBOX = env.SANDBOX_FRESH === "0";
// Picking up a failed run's uncommitted edits, which are still in this sandbox.
export const RESUMES_WORK = !!brief.resumesFailedRun && RESUMED_SANDBOX;
