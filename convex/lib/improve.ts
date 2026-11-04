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

// Runs per non-admin member per 24 hours, and for everyone combined.
export const MEMBER_DAILY_LIMIT = 25;
export const GLOBAL_DAILY_LIMIT = 200;

// The bot's member row. The .invalid domain can never receive a sign-in link.
export const CLAUDE_EMAIL = "claude@bot.invalid";

// Paths a change can't touch and still merge without review, whatever the policy.
export const SENSITIVE_PATHS = [
  /^convex\/schema\.ts$/,
  /^convex\/auth/,
  /^convex\/server\.ts$/,
  /^convex\/lib\/viewer\.ts$/,
  /^convex\/lib\/improve\.ts$/,
  /^app\/api\//,
  /^app\/commit\//,
  /^lib\/(stripe|terms|email|auth-server|auth-client)\.ts$/,
  /^scripts\//,
  /^\.github\//,
  /^package\.json$/,
  /^bun\.lock$/,
  /^(next\.config\.ts|vercel\.json|convex\.json)$/,
  /(^|\/)\.env/,
];

// Sandboxes are saved when they stop and kept this long, so a follow-up in the same
// thread resumes with the clone, node_modules, and the agent's session already there.
export const SANDBOX_KEEP_MS = 24 * 60 * 60 * 1000;

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
