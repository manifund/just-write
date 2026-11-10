// Runs one @Claude improvement inside a Vercel Sandbox (started by app/api/improve/route.ts).
// Installs deps, runs the Claude Agent SDK on the request, and checks the result. Steps are
// reported to Convex (convex/runner.ts), where Claude's card in the chat thread updates live.
// When it's done it sends the list of changed files to /api/improve, which reads them out of
// the sandbox, pushes them, opens the PR, and decides whether it merges.
//
// The sandbox has no GitHub token or server secret, only RUN_TOKEN: a key for this run that
// stops working once it finishes. The agent can read anything this process can, so keep it
// that way.
//
// The route copies this file and convex/lib/improve.ts out of the deployed commit into
// /tmp/improve-runner and runs it from there, with the clone as the working directory. So
// import only node built-ins and dependency-free files next to it statically; the Agent SDK is
// loaded from the clone's node_modules after `bun install` runs.
//
// Local dry run (no Convex reports, no push): IMPROVE_DRY_RUN=1 bun scripts/improve-runner.ts
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { AGENT_MODEL, REPO, SANDBOX_ROOT } from "../convex/lib/improve";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

type Brief = {
  number: number;
  branch: string;
  prNumber: number | null;
  resumeSessionId: string | null;
  // The thread's open PRs from earlier runs. The route picked which one (if any) this
  // continues before starting the sandbox (lib/improve-target.ts).
  openPrs?: { run: number; prNumber: number; title: string }[];
  request: string;
  requester: string;
  channel: string;
  threadUrl: string;
  thread: { author: string; text: string; at: number }[];
};

const env = process.env;
const DRY = env.IMPROVE_DRY_RUN === "1";
const ROOT = env.IMPROVE_ROOT ?? SANDBOX_ROOT;
const brief: Brief = JSON.parse(
  readFileSync(env.IMPROVE_BRIEF ?? "/tmp/brief.json", "utf8"),
);
const RUN_TOKEN = env.RUN_TOKEN ?? "";

// Members can pick the agent's effort level by writing e.g. "effort: high" in the request.
// Without one, the SDK uses the model's default.
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];
const EFFORT = brief.request
  .match(new RegExp(`\\beffort\\s*[:=]?\\s*(${EFFORTS.join("|")})\\b`, "i"))?.[1]
  .toLowerCase() as Effort | undefined;
const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY ?? "";

// --- Convex reporting -------------------------------------------------------------------

type Report = {
  step?: string;
  fail?: boolean;
  sessionId?: string;
};

// Calls a convex/runner.ts mutation for this run. Null if it failed; callers keep working.
async function runnerMutation(path: string, args: Record<string, unknown> = {}) {
  try {
    const res = await fetch(`${env.CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path,
        format: "json",
        args: { runToken: RUN_TOKEN, id: env.IMPROVEMENT_ID, ...args },
      }),
    });
    if (!res.ok) {
      console.error(path, "failed", res.status, await res.text());
      return null;
    }
    return ((await res.json()) as { value?: unknown }).value ?? null;
  } catch (err) {
    console.error(path, "failed", err);
    return null;
  }
}

let lastStep = "";
async function report(r: Report) {
  if (r.step) lastStep = r.step;
  if (DRY) return console.log("[report]", JSON.stringify(r));
  await runnerMutation("runner:report", r); // on failure the card just lags
}
const step = (label: string) => report({ step: label });

// Follow-ups members sent in the thread since the run started (runner.followUps).
async function claimFollowUps() {
  if (DRY) return [];
  const rows = await runnerMutation("runner:followUps");
  return (Array.isArray(rows) ? rows : []) as { author: string; text: string }[];
}

// --- Shell ------------------------------------------------------------------------------

function sh(cmd: string, opts: { quiet?: boolean } = {}) {
  const r = spawnSync("bash", ["-c", cmd], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...env, RUN_TOKEN: "" },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (!opts.quiet) console.log(`$ ${cmd}\n${out.slice(-4000)}`);
  return { ok: r.status === 0, out };
}
function must(cmd: string) {
  const r = sh(cmd);
  if (!r.ok)
    throw new Error(`\`${cmd}\` failed:\n${r.out.slice(-1500)}`);
  return r.out.trim();
}
const tail = (s: string, n = 6000) => (s.length > n ? `…${s.slice(-n)}` : s);

// --- Prompt -----------------------------------------------------------------------------

const RULES = `You are Claude, working in the codebase of the Just Write site (justwrite.club) at the request of a club member. Just Write is a small online writing club: members commit to publishing 4 essays in November 2026, and they talk in the site's own chat. A member mentioned you in that chat to ask for a change to the site, and they and others are watching your progress live.

How this run works:
- You're in a fresh clone of github.com/${REPO} on branch ${brief.branch}. When you finish, the harness typechecks, lints, commits, and pushes your work, then opens a PR or merges it, depending on the site's policy. Don't commit, push, or open PRs yourself.
- There's no dev server, browser, or local Convex backend here. Before you finish, run \`bun check\` (typecheck) and \`bun lint\` and fix anything they report.
- Never run \`bun convex\`, \`convex dev\`, \`convex deploy\`, \`convex run\`, or anything else that touches the live Convex deployment, which real members use. Don't edit env files or secrets.
- Before each step, write one short, plain sentence about what you're doing, e.g. "Looking at how the chat composer works." or "Adding a word count under the message box." Members see these sentences live as a checklist, so write them for people, not programmers, and keep them under 80 characters.
- Keep the change focused on what was asked, and follow CLAUDE.md and the site's existing patterns, design tokens, and plain copy style.
- If the request is unclear, far too large, would hurt members, or touches payments, terms, or other members' private data, don't change code: explain briefly in your final message instead. If it's a question, just answer it.
- Changes under convex/ deploy automatically when merged, but previews share the live backend, so a preview won't show them until then. If that matters for this change, say so in one short clause in your chat reply.

When you're done, return the structured result:
- title: a short imperative commit title, under 70 characters. Empty if you changed no files.
- chat: what members see in the thread. One or two short, plain sentences: what changed and where to see it. No lists, headings, file paths, or caveats about checks. If you changed no files, this is your answer or explanation, still short.
- details: notes for the admin reviewing the PR, in Markdown: decisions you made, new dependencies, limitations, anything to test by hand. Empty if there's nothing worth saying.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    chat: { type: "string" },
    details: { type: "string" },
  },
  required: ["title", "chat", "details"],
  additionalProperties: false,
};

type Final = { title: string | null; summary: string; details: string };

function prompt() {
  const thread = brief.thread
    .map((m) => `${m.author}: ${m.text}`)
    .join("\n\n");
  return [
    `${brief.requester} asked you, in #${brief.channel}:`,
    `"""\n${brief.request}\n"""`,
    brief.thread.length > 1 ? `The thread so far:\n"""\n${thread}\n"""` : "",
    brief.prNumber
      ? `This continues PR #${brief.prNumber}, picked from the thread as the work this request is about. Its earlier commits are already on this branch; build on them.`
      : "",
    !brief.prNumber && brief.openPrs?.length
      ? `This starts a new PR. The thread's other open PRs (${brief.openPrs.map((p) => `#${p.prNumber} "${p.title}"`).join(", ")}) were judged separate from this request. If it's really about one of them, say so in your chat reply and suggest naming it ("continue #${brief.openPrs[0].prNumber}"); members can also write "new PR" to force a fresh one.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// First sentence of a narration block, if it's short enough to show as a checklist line.
function statusLine(text: string) {
  const t = text.trim();
  if (!t) return null;
  const first = t.split(/(?<=[.!?:])\s|\n/)[0].replace(/[:.]$/, "").trim();
  // Long sentences are usually reasoning, not narration; skip them rather than truncate.
  return first.length >= 8 && first.length <= 100 ? first : null;
}

// The agent's structured result, or (if it somehow didn't return one) its last message.
function parseFinal(structured: unknown, text: string): Final {
  const o = (structured ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  if (str("chat"))
    return { title: str("title").slice(0, 100) || null, summary: str("chat"), details: str("details") };
  // Fallback: a "TITLE: ..." line anywhere in the text, everything else as the summary.
  const m = text.match(/^TITLE:\s*(.+)$/m);
  const title = m?.[1].trim();
  return {
    title: title && !/^none$/i.test(title) ? title.slice(0, 100) : null,
    summary: text.replace(/^TITLE:.*$/m, "").trim(),
    details: "",
  };
}

// --- Agent ------------------------------------------------------------------------------

// Files changed so far (tracked and new), relative to the repo root.
function dirtyFiles() {
  return sh("git status --porcelain --untracked-files=all", { quiet: true })
    .out.split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

const FOLLOW_UP_POLL_MS = 4000;

const userMessage = (
  text: string,
  priority?: SDKUserMessage["priority"],
): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: text },
  parent_tool_use_id: null,
  priority,
});

// The agent's input: the prompt, then any follow-ups from the thread while it works. They go
// in at priority "next", so the agent reads them after its current tool call, like a message
// typed into Claude Code mid-task. The stream ends once the agent has returned its result;
// later follow-ups wait and start as their own run (convex/improvements.ts#releaseWaiting).
async function* agentInput(first: string, isDone: () => boolean, waitForDone: Promise<void>) {
  yield userMessage(first);
  while (!isDone()) {
    await Promise.race([
      new Promise((r) => setTimeout(r, FOLLOW_UP_POLL_MS)),
      waitForDone,
    ]);
    if (isDone()) return;
    for (const f of await claimFollowUps()) {
      await step(`Reading a follow-up from ${f.author}`);
      yield userMessage(
        `${f.author} added this in the thread while you were working:\n"""\n${f.text}\n"""\nTake it into account, then carry on. When you're done, return the structured result covering the whole change.`,
        "next",
      );
    }
  }
}

// From the clone's node_modules: this file runs from /tmp/improve-runner (see the top).
async function loadSdk() {
  const path = createRequire(`${ROOT}/package.json`).resolve("@anthropic-ai/claude-agent-sdk");
  return (await import(pathToFileURL(path).href)) as typeof import("@anthropic-ai/claude-agent-sdk");
}

async function runAgent(input: string, resume?: string) {
  const { query } = await loadSdk();
  let done = false;
  let markDone = () => {};
  const waitForDone = new Promise<void>((r) => (markDone = r));

  const reported = new Set(dirtyFiles());
  let typechecked = false;
  let final: Final = { title: null, summary: "", details: "" };
  let sessionId = resume ?? "";
  const q = query({
    prompt: agentInput(input, () => done, waitForDone),
    options: {
      cwd: ROOT,
      model: AGENT_MODEL,
      resume,
      effort: EFFORT,
      maxTurns: 150,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"], // loads CLAUDE.md
      outputFormat: { type: "json_schema", schema: RESULT_SCHEMA },
      systemPrompt: { type: "preset", preset: "claude_code", append: RULES },
      env: {
        ...env,
        RUN_TOKEN: "",
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_AUTH_TOKEN: OPENROUTER_API_KEY,
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_DEFAULT_OPUS_MODEL: AGENT_MODEL,
        ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-5.5",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "anthropic/claude-haiku-5.5",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    },
  });

  for await (const msg of q) {
    if (msg.type === "system" && msg.subtype === "init")
      sessionId = msg.session_id;
    if (msg.type === "assistant" && !msg.parent_tool_use_id) {
      for (const block of msg.message.content) {
        // The agent narrates in short sentences between tool calls; those are its status lines.
        if (block.type === "text") {
          const line = statusLine(block.text);
          if (line) await step(line);
        } else if (block.type === "tool_use") {
          const cmd = String((block.input as { command?: unknown }).command ?? "");
          console.log("[tool]", block.name, JSON.stringify(block.input).slice(0, 200));
          if (!typechecked && /\btsc\b|\bbun (--)?check\b/.test(cmd)) {
            typechecked = true;
            await step("Typechecking");
          }
        }
      }
    }
    // Tool results are back: log newly changed files (the card lists files at the end).
    if (msg.type === "user") {
      for (const f of dirtyFiles())
        if (!reported.has(f)) {
          reported.add(f);
          console.log("[edited]", f);
        }
    }
    if (msg.type === "result") {
      // Stop taking follow-ups. One sent just before this still gets its own turn, and its
      // result (the last one) is what counts.
      done = true;
      markDone();
      sessionId = msg.session_id;
      if (msg.subtype === "success")
        final = parseFinal(msg.structured_output, msg.result);
      else throw new Error(`The agent stopped early (${msg.subtype}).`);
    }
  }
  done = true;
  markDone();
  return { final, sessionId };
}

// --- Checks ----------------------------------------------------------------------------

function checks() {
  const tsc = sh("bun check");
  const lint = sh("bun lint");
  return {
    ok: tsc.ok && lint.ok,
    output: [!tsc.ok && tail(tsc.out, 4000), !lint.ok && tail(lint.out, 4000)]
      .filter(Boolean)
      .join("\n\n"),
  };
}

// --- Main -------------------------------------------------------------------------------

// What this sends to /api/improve when it's done (lib/improve-finish.ts#RunnerResult).
type ChangedFile = { path: string; mode: "100644" | "100755" | null }; // null: deleted
type RunnerResult =
  | { outcome: "answered"; summary: string }
  | { outcome: "failed"; error: string }
  | {
      outcome: "changes";
      base: string;
      files: ChangedFile[];
      title: string | null;
      summary: string;
      details: string;
      checksPassed: boolean;
    };

// Every file that differs from `base` (tracked, new, and deleted), with its git file mode.
function changedFiles(base: string): ChangedFile[] {
  must("git add -A");
  const r = sh(`git diff --cached --raw -z --no-renames ${base}`, { quiet: true });
  if (!r.ok) throw new Error(`Couldn’t list the changed files:\n${r.out.slice(-1500)}`);
  // -z output: ":<old mode> <new mode> <old sha> <new sha> <status>" NUL "<path>" NUL ...
  const parts = r.out.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].trim();
    const path = parts[i + 1];
    if (!meta.startsWith(":")) continue;
    const [, mode] = meta.slice(1).split(" ");
    if (meta.endsWith("D")) files.push({ path, mode: null });
    else if (mode === "100644" || mode === "100755") files.push({ path, mode });
    else throw new Error(`${path} is a symlink or submodule, which I can’t push.`);
  }
  return files;
}

async function main(): Promise<RunnerResult> {
  const { branch } = brief;
  await step("Installing dependencies");
  if (!sh("bun install --frozen-lockfile").ok) must("bun install");
  sh("bunx next typegen"); // the typecheck needs Next's generated route types

  if (brief.prNumber) {
    // A saved sandbox may already be on the branch; match GitHub either way.
    const fetched = sh(
      `git reset -q --hard && git clean -fdq && git fetch origin ${branch} && git checkout -B ${branch} FETCH_HEAD`,
    );
    if (!fetched.ok) throw new Error(`Couldn’t check out ${branch}.`);
  } else must(`git checkout -B ${branch}`);
  // The site commits the changes on top of this. For a follow-up it's the branch's head on
  // GitHub, and the route checks it still is.
  const base = must("git rev-parse HEAD");

  // Resume the earlier agent session if this is its saved sandbox; otherwise start fresh.
  const resume =
    env.SANDBOX_FRESH === "0" ? (brief.resumeSessionId ?? undefined) : undefined;
  if (EFFORT) await step(`Using ${EFFORT} effort`);
  await step(resume ? "Picking up where I left off" : "Reading the code");
  let { final, sessionId } = await runAgent(prompt(), resume).catch((err) => {
    if (!resume) throw err;
    console.error("resume failed; starting a new session", err);
    return runAgent(prompt());
  });
  await report({ sessionId });

  if (changedFiles(base).length === 0)
    return { outcome: "answered", summary: final.summary };

  await step("Running the typecheck and linter");
  let check = checks();
  for (let attempt = 0; !check.ok && attempt < 2; attempt++) {
    await step("Fixing typecheck and lint errors");
    ({ final, sessionId } = await runAgent(
      `The harness's checks failed:\n\n${check.output}\n\nFix these, run the checks again, and return the structured result again, covering the whole change.`,
      sessionId,
    ));
    await step("Running the typecheck and linter again");
    check = checks();
  }
  const files = changedFiles(base);
  if (files.length === 0) return { outcome: "answered", summary: final.summary };
  return {
    outcome: "changes",
    base,
    files,
    title: final.title,
    summary: final.summary,
    details: final.details,
    checksPassed: check.ok,
  };
}

// Hands the result to /api/improve, which pushes it, updates the card, and stops this sandbox.
async function finish(result: RunnerResult) {
  if (DRY) return console.log("[dry run] would finish with", JSON.stringify(result, null, 2));
  try {
    const res = await fetch(env.IMPROVE_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: env.IMPROVEMENT_ID, runToken: RUN_TOKEN, finish: result }),
    });
    if (!res.ok) console.error("finish failed", res.status, await res.text());
  } catch (err) {
    console.error("finish failed", err); // the run is marked failed when it goes stale
  }
}

main()
  .catch((err): RunnerResult => {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      outcome: "failed",
      error: `Failed while ${lastStep.charAt(0).toLowerCase()}${lastStep.slice(1) || "starting"}: ${message.slice(0, 300)}`,
    };
  })
  .then(finish);
