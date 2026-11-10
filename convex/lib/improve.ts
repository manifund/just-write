// Settings for @Claude site improvements, shared by Convex, the Next.js routes, and the
// runner that works inside a Vercel Sandbox (scripts/improve-runner.ts).

// review: always open a PR for an admin to merge.
// automerge: merge whenever typecheck and lint pass.
// classify: a second model call decides per change (small and low-risk → merge; else PR).
export const MERGE_POLICY: "review" | "automerge" | "classify" = "classify";

// Production builds on Vercel push convex/ before building the site (buildCommand in
// vercel.json, using the CONVEX_DEPLOY_KEY env var), so merged backend changes deploy themselves.
// Set to false to make every change under convex/ wait for review.
export const CONVEX_AUTODEPLOY = true;

export const REPO = "manifund/just-write";
export const SANDBOX_ROOT = "/vercel/just-write"; // where Vercel Sandbox clones the repo
export const AGENT_MODEL = "anthropic/claude-opus-5.5"; // OpenRouter slug
export const CLASSIFIER_MODEL = "anthropic/claude-sonnet-5.5";

// Members can pick the agent's effort level by writing e.g. "effort: high" in the request.
// A follow-up that doesn't set one keeps the effort of the run it continues
// (convex/server.ts#continuePr). Without either, the SDK uses the model's default.
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export function parseEffort(request: string): Effort | undefined {
  const m = request.match(
    new RegExp(`\\beffort\\s*[:=]?\\s*(${EFFORTS.join("|")})\\b`, "i"),
  );
  return m ? (m[1].toLowerCase() as Effort) : undefined;
}

export function isEffort(value: unknown): value is Effort {
  return EFFORTS.includes(value as Effort);
}

// Runs per non-admin member per 24 hours, and for everyone combined.
export const MEMBER_DAILY_LIMIT = 25;
export const GLOBAL_DAILY_LIMIT = 200;

// The bot's member row. The .invalid domain can never receive a sign-in link.
export const CLAUDE_EMAIL = "claude@bot.invalid";

// Paths a change can't touch and still merge without review, whatever the policy.
export const SENSITIVE_PATHS = [
  /^convex\/schema\.ts$/,
  /^convex\/auth/,
  /^convex\/(server|runner|chatTasks)\.ts$/,
  // What keeps chat tasks' data and #check-ins text members-only.
  /^convex\/(improvements|chat|activity)\.ts$/,
  /^convex\/lib\/(markdown|richtext|channels)\.ts$/,
  /^convex\/lib\/viewer\.ts$/,
  /^convex\/lib\/improve\.ts$/,
  /^app\/api\//,
  /^app\/commit\//,
  /^lib\/(stripe|terms|email|auth-server|auth-client|github|improve-finish|chat-task-sandbox|club-snapshot)\.ts$/,
  /^scripts\//,
  /^\.github\//,
  // Instructions every agent run loads, chat tasks included.
  /^(CLAUDE|AGENTS)\.md$/,
  /^\.claude\//,
  /^package\.json$/,
  /^bun\.lock$/,
  /^(next\.config\.ts|vercel\.json|convex\.json)$/,
  /(^|\/)\.env/,
];

// Sandboxes are saved when they stop and kept this long, so a follow-up in the same
// thread resumes with the clone, node_modules, and the agent's session already there.
export const SANDBOX_KEEP_MS = 24 * 60 * 60 * 1000;

// How long a code run's sandbox (agent and checks) and a chat task's sandbox may run. The
// runner gives a chat task's agent 15 minutes (scripts/improve-runner.ts).
export const RUN_TIMEOUT_MS = 40 * 60 * 1000;
export const CHAT_TIMEOUT_MS = 25 * 60 * 1000;
// /api/improve's maxDuration: a code run's finish request can take this long after its
// sandbox is done.
export const ROUTE_MAX_MS = 5 * 60 * 1000;

// When improvements.reapStale gives up on a run that's still queued or running: its sandbox
// has stopped by then, and so has any request that could still report for it.
export function staleAfterMs(kind: "chat" | undefined) {
  return kind === "chat"
    ? CHAT_TIMEOUT_MS + ROUTE_MAX_MS
    : RUN_TIMEOUT_MS + ROUTE_MAX_MS + 2 * 60 * 1000;
}

// Chat tasks (convex/chatTasks.ts): runs that read the club's data instead of changing
// code, to answer a question or post something for the member who asked. A request is one
// if it says "chat task", or if every earlier run in its thread was one and it doesn't ask
// for a PR. Their sandboxes are always behind a firewall (lib/chat-task-sandbox.ts); if
// that stops working, set CHAT_TASKS_ENABLED to false to turn them off.
export const CHAT_TASKS_ENABLED = true;
export const CHAT_DRAFT_MAX_CHARS = 6000;
export const CHAT_MENTION_LIMIT = 10;
// Where Claude may post a chat task's result. Never #check-ins: a check-in is a member's
// own writing, and posting one unlocks everyone else's.
export const CHAT_POST_CHANNELS = [
  "general",
  "published",
  "meetups",
  "random",
  "site",
];
// Posts per member and for the whole club in 24 hours. Past these, Claude leaves a draft on
// its card for the member to send instead.
export const CHAT_POSTS_PER_MEMBER = 5;
export const CHAT_POSTS_PER_DAY = 20;

const CHAT_TASK = /\bchat[- ]task\b/i;
// "new PR", "PR 40", "continue #40": the member wants code, even in a chat task's thread.
export const NEW_PR =
  /\b(new|separate|fresh|another|different)\s+(pr|pull request|branch)\b/i;
// Not a bare "#2": in a chat thread that's usually "week #2" or "#1 on the board".
const NAMES_PR = /\b(?:pr|pull request|continue)\s*#?\d+\b/i;

// `earlier`: the kinds of the thread's earlier runs. A thread that has only had chat
// tasks keeps going as one; any code run in it means a request needs the keyword.
export function isChatTask(request: string, earlier: ("chat" | undefined)[]) {
  if (!CHAT_TASKS_ENABLED) return false;
  if (CHAT_TASK.test(request)) return true;
  return (
    earlier.length > 0 &&
    earlier.every((k) => k === "chat") &&
    !NEW_PR.test(request) &&
    !NAMES_PR.test(request)
  );
}

// The sandbox holds no site secrets. It gets a random key that only works for its own run
// while it's going (convex/runner.ts, and finishing through /api/improve); Convex keeps its hash.
export async function hashRunToken(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// One sandbox per branch; follow-ups on the same PR reuse it.
export function sandboxNameFor(branch: string) {
  return `just-write-${branch.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

export function branchFor(n: number) {
  return `claude/${n}`;
}

// Vercel's stable URL for a branch's latest preview deployment.
export function previewUrlFor(branch: string) {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `https://just-write-git-${slug}-manifund.vercel.app`;
}

export type ImprovementStatus =
  | "queued"
  | "running"
  | "answered" // replied without changing code
  | "pr" // PR open, waiting for an admin
  | "merged"
  | "closed"
  | "failed"
  | "superseded"; // a follow-up in the same thread took over the PR
