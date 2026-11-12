// Settings for @Claude site improvements, shared by Convex, the Next.js routes, and the
// runner that works inside a Vercel Sandbox (scripts/improve-runner.ts).

// review: always open a PR for an admin to merge.
// automerge: merge whenever typecheck and lint pass.
// classify: a second model call (MERGE_REVIEW_MODEL) answers a fixed checklist about the
// change (lib/improve-finish.ts#CHECKLIST); any yes means a PR for an admin, else it merges.
// A few questions (calling outside sites, scheduled jobs, small extras) can also be answered
// "safe" with a reason, which passes.
export const MERGE_POLICY: "review" | "automerge" | "classify" = "classify";

// Production builds on Vercel push convex/ before building the site (buildCommand in
// vercel.json, using the CONVEX_DEPLOY_KEY env var), so merged backend changes deploy themselves.
// Set to false to make every change under convex/ wait for review.
export const CONVEX_AUTODEPLOY = true;
// There's no test backend, so at most this many changes under convex/ merge without an admin
// in 24 hours (counted in convex/server.ts#startFinish); after that they wait for review.
export const BACKEND_AUTOMERGES_PER_DAY = 5;

export const REPO = "manifund/just-write";
export const SANDBOX_ROOT = "/vercel/just-write"; // where Vercel Sandbox clones the repo
export const AGENT_MODEL = "anthropic/claude-opus-5.5"; // OpenRouter slug
export const CLASSIFIER_MODEL = "anthropic/claude-sonnet-5.5"; // quick calls about a request
// Reads every change that could merge without an admin (lib/improve-finish.ts#review).
export const MERGE_REVIEW_MODEL = "anthropic/claude-opus-5.5";

// "anthropic/claude-opus-5.5" → "Opus 5.5", for the card (improvements.ts#cardOf).
export function modelLabel(slug: string) {
  const m = slug.match(/claude-([a-z]+)-([\d.]+)/i);
  if (!m) return slug.replace(/^.*\//, "");
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}`;
}

// ---------- What a message to @Claude can say ----------
// Members steer a request with `!` words at the start of the message, right after the
// mention: "@Claude !chat !effort high who has published twice?". readRequest is the one
// parser for them, and HELP (below) lists the same words for "@Claude !help" and the
// /improvements page, so add a word to both. A `!` word later in the message is just text,
// so "add a !mute command" is still a request. The older phrases ("chat task", "new PR",
// "continue #40", "effort: high", "in parallel") still work anywhere in the message.

// The agent's effort level. A follow-up that doesn't set one keeps the effort of the run it
// continues (convex/server.ts#continuePr), or else of the thread's latest earlier run that had
// one (server.ts#threadEffort). Without any, the SDK uses the model's default. Sent while a
// code run is going, it switches that agent's effort (server.ts#takeFollowUps).
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export function isEffort(value: unknown): value is Effort {
  return EFFORTS.includes(value as Effort);
}

// Commands get a reply right away and start no run (improvements.ts#startFromMessage). A
// message that starts with one is only that command.
// !status: the thread's latest run. !help: HELP. !mute/!unmute: whether replies that don't
// mention @Claude reach it in this thread (convex/untagged.ts).
export const COMMANDS = ["status", "help", "mute", "unmute"] as const;
export type Command = (typeof COMMANDS)[number];

export type Directions = {
  command: Command | null;
  // A `!` word at the start that isn't one of ours ("!stauts"), or one missing its value
  // ("!pr" without a number): what to tell the member instead of starting a run.
  problem: string | null;
  // !chat: a chat task (convex/chatTasks.ts). !code, !new, !pr 40, !parallel: a code run.
  // null when the message doesn't say: then a thread of only chat tasks keeps going as one
  // (isChatTask), and otherwise a quick check decides before the sandbox starts
  // (lib/improve-kind.ts).
  kind: "chat" | "code" | null;
  newPr: boolean; // !new: a new PR, not one already open in the thread (lib/improve-target.ts)
  pr: number | null; // !pr 40: continue PR #40
  effort: Effort | undefined; // !effort high
  // !parallel: split a list of changes into runs that go at the same time (lib/improve-split.ts)
  parallel: boolean;
  // !restart: start the thread's latest code run over with a fresh agent session, on the same
  // PR if it has an open one, instead of resuming the old session (which would carry a wrong
  // turn along). A run still going is stopped first, as with the Stop button. The directions
  // written after the switches ("" if none); null without !restart.
  restart: string | null;
};

const CHAT_TASK = /\bchat[- ]task\b/i;
const NEW_PR =
  /\b(new|separate|fresh|another|different)\s+(pr|pull request|branch)\b/i;
// "PR 40", "continue #40". Not a bare "#2": in a chat thread that's usually "week #2".
const NAMES_PR = /\b(?:pr|pull request|continue)\s*#?\d+\b/i;
const EFFORT = new RegExp(
  `\\beffort\\s*[:=]?\\s*(${EFFORTS.join("|")})\\b`,
  "i",
);
const PARALLEL =
  /\bparallel\b|\bseparate (?:prs|pull requests|runs|sessions)\b/i;

export function readRequest(text: string): Directions {
  const out: Directions = {
    command: null,
    problem: null,
    kind: null,
    newPr: false,
    pr: null,
    effort: undefined,
    parallel: false,
    restart: null,
  };
  let rest = text.replace(/@\S+/g, " ").trim();
  let restart = false;
  // The value after "!pr" or "!effort", taken off `rest`.
  const value = (re: RegExp) => {
    const m = re.exec(rest);
    if (m) rest = rest.slice(m[0].length);
    return m?.[1];
  };
  for (let m; (m = /^!([a-z]+)\b/i.exec(rest));) {
    const word = m[1].toLowerCase();
    rest = rest.slice(m[0].length);
    if (COMMANDS.includes(word as Command)) {
      out.command = word as Command;
      return out;
    }
    if (word === "chat" || word === "code") out.kind = word;
    else if (word === "new") {
      out.kind = "code";
      out.newPr = true;
    } else if (word === "parallel") {
      out.kind = "code";
      out.parallel = true;
    } else if (word === "restart") restart = true;
    else if (word === "pr") {
      const n = value(/^[\s:]*#?(\d+)\b/);
      if (!n) {
        out.problem = "“!pr” needs a PR number, like “!pr 40”.";
        return out;
      }
      out.kind = "code";
      out.pr = Number(n);
    } else if (word === "effort") {
      const e = value(new RegExp(`^[\\s:=]*(${EFFORTS.join("|")})\\b`, "i"));
      if (!e) {
        out.problem = `“!effort” needs a level: ${EFFORTS.join(", ")}.`;
        return out;
      }
      out.effort = e.toLowerCase() as Effort;
    } else {
      out.problem = `I don’t know “!${word}”.`;
      return out;
    }
    rest = rest.replace(/^[\s:.,;-]+/, "");
  }
  if (restart) out.restart = rest.trim();
  // The older phrases, anywhere in the message. A `!` word wins over them.
  out.effort ??= EFFORT.exec(text)?.[1].toLowerCase() as Effort | undefined;
  out.newPr ||= NEW_PR.test(text);
  out.parallel ||= PARALLEL.test(text);
  out.kind ??= CHAT_TASK.test(text)
    ? "chat"
    : out.newPr || NAMES_PR.test(text)
      ? "code"
      : null;
  return out;
}

// What @Claude understands, for "@Claude !help" (convex/improvements.ts#helpDoc) and the
// /improvements page. Keep it in step with readRequest.
export const HELP = {
  example: "@Claude !chat !effort high who has published twice?",
  steer: [
    [
      "!chat",
      "Read the club’s chat, essays, and calendar to answer a question or post one message.",
    ],
    ["!code", "Change the site and open a PR."],
    ["!new", "Change the site in a new PR, not one already open here."],
    ["!pr 40", "Keep working on PR #40."],
    [
      "!effort high",
      "How hard I think: low, medium, high, xhigh, or max. Works while I’m working, too.",
    ],
    [
      "!parallel",
      "Split a list of changes into separate runs and PRs that go at the same time.",
    ],
    [
      "!restart",
      "Redo this thread’s last change from scratch, on the same PR, with any directions after it.",
    ],
  ],
  commands: [
    ["!status", "What I’m doing in this thread."],
    ["!help", "This list."],
    ["!mute", "Only read messages in this thread that mention me."],
    ["!unmute", "Read replies in this thread without a tag again."],
  ],
  notes: [
    "Without !chat or !code, I work out which one you mean. In a thread where I’ve only done chat tasks, I keep doing those.",
    "A reply in a thread keeps working on its open PR if it’s about the same change. Replies reach me without a tag while I’m working and for a day after.",
  ],
} as const;

// Replies that don't mention @Claude (convex/untagged.ts). While a code run is going, they're
// passed to it. After that, for a day after Claude's last run in the thread, a quick model
// call decides whether a reply asks Claude for something, and if so it starts a run as if
// tagged. At most UNTAGGED_CHECKS_PER_DAY such calls per thread. `@Claude !mute` in a thread
// turns both off there; `@Claude !unmute` turns them back on.
export const UNTAGGED_WINDOW_MS = 24 * 60 * 60 * 1000;
export const UNTAGGED_CHECKS_PER_DAY = 10;
export const UNTAGGED_PER_RUN = 20; // replies queued for one running code run
// One message can ask for several separate changes at once ("!parallel add X, fix Y").
// If a code run's request asks for that (readRequest's `parallel`), the route asks a quick
// model call to split it (lib/improve-split.ts); each part becomes its own run, with its own
// card, sandbox, and new PR, all going at the same time (convex/server.ts#splitRun). A
// request that's really one change stays one run. Each part counts toward the daily limits.
export const MAX_PARALLEL = 5;

// Runs per non-admin member per 24 hours, and for everyone combined.
export const MEMBER_DAILY_LIMIT = 25;
export const GLOBAL_DAILY_LIMIT = 200;

// The bot's member row. The .invalid domain can never receive a sign-in link.
export const CLAUDE_EMAIL = "claude@bot.invalid";

// Paths a change can't touch and still merge without review, whatever the policy. This is a
// denylist: other server code (pages, server actions, Convex functions) can still read env and
// is left to the merge review, which also reads those files whole. Set MERGE_POLICY to
// "review" to take the review out of it. convex/chat.ts (the #check-ins gate) and
// convex/activity.ts aren't here: the review's checklist asks about check-in text directly.
export const SENSITIVE_PATHS = [
  /^convex\/auth/,
  /^convex\/(server|runner|chatTasks|untagged|prSync|http|crons|previewAccess|convex\.config)\.ts$/,
  // Runs and their logs, which quote chat and chat tasks' members-only data.
  /^convex\/improvements\.ts$/,
  /^convex\/lib\/(markdown|richtext|channels)\.ts$/,
  /^convex\/lib\/(viewer|improve|improveLogs|messages|email|claude)\.ts$/,
  /^convex\/(gcal|pushAction|similarAction)\.ts$/,
  /^app\/api\//,
  /^app\/\(site\)\/commit\//,
  /^app\/\(portal\)\/\(private\)\/(improvements|admin)\//,
  /^lib\/(stripe|terms|email|auth-server|auth-client|github|improve-[\w-]+|time-limit|chat-task-sandbox|club-snapshot)\.ts$/,
  // The @Claude runner (copied into every sandbox) and its dry run, and scripts that send
  // email or write member data. Other scripts (the zine ones) go to the merge review.
  /^scripts\/(improve-runner|improve-try|email-blast|import-neon)(\/|\.ts$)/,
  /^\.github\//,
  // Instructions and hooks every agent run loads, chat tasks included. The root CLAUDE.md
  // goes to the merge review, which asks what the change tells agents; nested and .local
  // ones always wait.
  /^(?!CLAUDE\.md$)(.*\/)?(CLAUDE|AGENTS)(\.local)?\.md$/,
  /^\.claude\//,
  /^public\/sw\.js$/, // the service worker runs in every member's browser
  /^package\.json$/,
  /^bun\.lock$/,
  // Config that runs at build time or changes how code resolves, in any of its spellings.
  /^(next|postcss|tailwind)\.config\.[cm]?[jt]s$/,
  /^(src\/)?(instrumentation|middleware|proxy)(-client)?\.[cm]?[jt]sx?$/,
  /^(vercel|convex|tsconfig|convex\/tsconfig)\.json$/,
  /^(bunfig\.toml|\.npmrc|\.gitmodules)$/,
  /(^|\/)\.gitattributes$/,
  /(^|\/)\.env/,
];

// Paths that can merge without review only when their diff adds lines and removes none, and
// the merge review agrees: new tables, indexes, and optional fields in the schema.
export const ADDITIVE_ONLY_PATHS = [/^convex\/schema\.ts$/];

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
// if it says "!chat" (readRequest), if every earlier run in its thread was one and it doesn't
// ask for code, or if a quick check before its sandbox starts reads it as one
// (lib/improve-kind.ts). Their sandboxes are always behind a firewall
// (lib/chat-task-sandbox.ts); if that stops working, set CHAT_TASKS_ENABLED to false to turn
// them off.
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

// Images posted in the request's thread are passed to the agent (the newest ones, up to
// this many). Bigger files are skipped: the model API takes about 5 MB once base64-encoded.
export const BRIEF_IMAGES_MAX = 8;
export const BRIEF_IMAGE_BYTES = 3_750_000;

// A code run's brief also lists other threads' open PRs and latest merges, so the agent knows
// what else is changing on the site (convex/server.ts#otherWork): at most this many of each,
// with up to BRIEF_FILES_MAX of each PR's files.
export const BRIEF_OTHER_OPEN_MAX = 20;
export const BRIEF_OTHER_MERGED_MAX = 10;
export const BRIEF_FILES_MAX = 12;

// `earlier`: the kinds of the thread's earlier runs. A request that doesn't say which kind it
// is (readRequest) stays a chat task in a thread that has only had chat tasks.
export function isChatTask(request: string, earlier: ("chat" | undefined)[]) {
  if (!CHAT_TASKS_ENABLED) return false;
  const { kind } = readRequest(request);
  if (kind) return kind === "chat";
  return earlier.length > 0 && earlier.every((k) => k === "chat");
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

// Run logs (convex/lib/improveLogs.ts). Here so the runner, which can only import this file,
// clips events the same way.
export const LOG_EVENT_CHARS = 4000;
export const LOG_BATCH_EVENTS = 100;

// Cuts `s` to at most `n` characters, saying how much was left out.
export function clip(s: string, n: number) {
  if (s.length <= n) return s;
  const keep = Math.max(0, n - 40); // room for the note
  return `${s.slice(0, keep)}… [${s.length - keep} more characters]`;
}
