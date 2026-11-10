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
  const m = request.match(new RegExp(`\\beffort\\s*[:=]?\\s*(${EFFORTS.join("|")})\\b`, "i"));
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
  /^convex\/(server|runner)\.ts$/,
  /^convex\/lib\/viewer\.ts$/,
  /^convex\/lib\/improve\.ts$/,
  /^app\/api\//,
  /^app\/commit\//,
  /^lib\/(stripe|terms|email|auth-server|auth-client|github|improve-finish)\.ts$/,
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

// The sandbox holds no site secrets. It gets a random key that only works for its own run
// while it's going (convex/runner.ts, and finishing through /api/improve); Convex keeps its hash.
export async function hashRunToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
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
