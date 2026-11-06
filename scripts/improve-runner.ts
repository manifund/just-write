// Runs one @Claude improvement inside a Vercel Sandbox (started by app/api/improve/route.ts).
// Installs deps, runs the Claude Agent SDK on the request, checks the result, pushes a branch,
// opens a PR, and merges it if MERGE_POLICY allows. Every step is reported to Convex, where
// Claude's card in the chat thread updates live.
//
// Only node built-ins and dependency-free repo files are imported statically: the Agent SDK
// is loaded after `bun install` runs.
//
// Local dry run (no Convex reports, no push): IMPROVE_DRY_RUN=1 bun scripts/improve-runner.ts
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  AGENT_MODEL,
  CLASSIFIER_MODEL,
  CONVEX_AUTODEPLOY,
  MERGE_POLICY,
  REPO,
  SANDBOX_ROOT,
  SENSITIVE_PATHS,
  previewUrlFor,
} from "../convex/lib/improve";
import { comment, createPr, mergePr } from "../lib/github";

type Brief = {
  number: number;
  branch: string;
  prNumber: number | null;
  resumeSessionId: string | null;
  request: string;
  requester: string;
  requesterHandle?: string | null; // for "just for me" opt-ins (lib/opt-ins.ts)
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
const GITHUB_TOKEN = env.GITHUB_TOKEN ?? "";
const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY ?? "";

// --- Convex reporting -------------------------------------------------------------------

type Report = {
  step?: string;
  fail?: boolean;
  patch?: Record<string, unknown>;
};

let lastStep = "";
async function report(r: Report) {
  if (r.step) lastStep = r.step;
  if (DRY) return console.log("[report]", JSON.stringify(r));
  try {
    const res = await fetch(`${env.CONVEX_URL}/api/mutation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "server:reportImprovement",
        format: "json",
        args: { secret: env.CONVEX_SERVER_SECRET, id: env.IMPROVEMENT_ID, ...r },
      }),
    });
    if (!res.ok) console.error("report failed", res.status, await res.text());
  } catch (err) {
    console.error("report failed", err); // keep working; the card just lags
  }
}
const step = (label: string) => report({ step: label });

// --- Shell ------------------------------------------------------------------------------

// Keeps the GitHub token out of logs and of errors shown in chat.
const redact = (s: string) =>
  GITHUB_TOKEN ? s.split(GITHUB_TOKEN).join("***") : s;

function sh(cmd: string, opts: { quiet?: boolean } = {}) {
  const r = spawnSync("bash", ["-c", cmd], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...env, GITHUB_TOKEN: "", CONVEX_SERVER_SECRET: "" },
  });
  const out = redact(`${r.stdout ?? ""}${r.stderr ?? ""}`);
  if (!opts.quiet) console.log(`$ ${redact(cmd)}\n${out.slice(-4000)}`);
  return { ok: r.status === 0, out };
}
function must(cmd: string) {
  const r = sh(cmd);
  if (!r.ok)
    throw new Error(`\`${redact(cmd)}\` failed:\n${r.out.slice(-1500)}`);
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

"Just for me" requests:
- If the member says the change is just for them (e.g. "just for me", "only for me", "for myself"), or this thread already made one, build it as an opt-in: add an entry to \`OPT_INS\` in lib/opt-ins.ts (a new kebab-case \`key\`, a short plain \`label\`, \`for: ${JSON.stringify(brief.requesterHandle ?? "")}\`, \`by: ${JSON.stringify(brief.requester)}\`), and gate every visible difference with \`useOptIn("<key>")\` from components/portal/opt-ins.ts. It's on for them and off for everyone else, who can turn it on in /settings. In a follow-up, keep using the same key.
- With the opt-in off, the site must look and work exactly as before. Keep it to client components and CSS: don't change convex/, server code, routes, or dependencies. If the request can't be done that way (it needs new data, or a backend change), say so in your reply and don't change code.
- In your chat reply, say it's on just for them and that others can turn it on in Settings.${brief.requesterHandle ? "" : "\n- This member has no handle yet, so ask them to set one in Settings first and don't change code."}

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
      ? `This continues PR #${brief.prNumber}. Its earlier commits are already on this branch; build on them.`
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

async function runAgent(input: string, resume?: string) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const reported = new Set(dirtyFiles());
  let typechecked = false;
  let final: Final = { title: null, summary: "", details: "" };
  let sessionId = resume ?? "";
  const q = query({
    prompt: input,
    options: {
      cwd: ROOT,
      model: AGENT_MODEL,
      resume,
      maxTurns: 150,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"], // loads CLAUDE.md
      outputFormat: { type: "json_schema", schema: RESULT_SCHEMA },
      systemPrompt: { type: "preset", preset: "claude_code", append: RULES },
      env: {
        ...env,
        GITHUB_TOKEN: "",
        CONVEX_SERVER_SECRET: "",
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
      sessionId = msg.session_id;
      if (msg.subtype === "success")
        final = parseFinal(msg.structured_output, msg.result);
      else throw new Error(`The agent stopped early (${msg.subtype}).`);
    }
  }
  return { final, sessionId };
}

// --- Checks and merge decision ---------------------------------------------------------

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

async function classify(diff: string): Promise<{ merge: boolean; why: string }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You review diffs to a small community website before they go live without human review. Answer with JSON {"decision": "auto" | "review", "reason": "<under 15 words>"}. ' +
              '"auto" only if the change is small and clearly safe: UI, copy, styling, or self-contained features with no risk of losing or exposing data, no new dependencies, and no changes to auth, payments, terms, email, schema, permissions, or environment. Anything else, or anything you are unsure about, is "review". ' +
              'A change that only adds an opt-in to lib/opt-ins.ts and gates new client-side UI behind useOptIn(...) can be "auto" even if it is larger, as long as the site is unchanged for members with the opt-in off, and it touches no server code, routes, or backend.',
          },
          {
            role: "user",
            content: `Request: ${brief.request}\n\nDiff:\n${diff.slice(0, 60_000)}`,
          },
        ],
      }),
    });
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content);
    return {
      merge: out.decision === "auto",
      why: String(out.reason ?? "").slice(0, 200),
    };
  } catch (err) {
    console.error("classifier failed", err);
    return { merge: false, why: "the classifier didn’t answer" };
  }
}

async function decide(files: string[], checksPassed: boolean, diff: string) {
  if (!checksPassed) return { merge: false, why: "typecheck or lint failed" };
  if (MERGE_POLICY === "review") return { merge: false, why: "every change gets reviewed for now" };
  if (!CONVEX_AUTODEPLOY && files.some((f) => f.startsWith("convex/")))
    return { merge: false, why: "it changes the backend" };
  const sensitive = files.filter((f) => SENSITIVE_PATHS.some((re) => re.test(f)));
  if (sensitive.length)
    return { merge: false, why: `it touches ${sensitive.slice(0, 3).join(", ")}` };
  if (MERGE_POLICY === "automerge") return { merge: true, why: "checks passed" };
  return await classify(diff);
}

// --- Main -------------------------------------------------------------------------------

async function main() {
  const { branch } = brief;
  await step("Installing dependencies");
  if (!sh("bun install --frozen-lockfile").ok) must("bun install");
  sh("bunx next typegen"); // the typecheck needs Next's generated route types

  must(`git config user.name "Claude" && git config user.email "noreply@anthropic.com"`);
  if (brief.prNumber) {
    // A saved sandbox may already be on the branch; match GitHub either way.
    const fetched = sh(
      `git reset -q --hard && git clean -fdq && git fetch origin ${branch} && git checkout -B ${branch} FETCH_HEAD`,
    );
    if (!fetched.ok) throw new Error(`Couldn’t check out ${branch}.`);
  } else must(`git checkout -B ${branch}`);
  const base = must("git rev-parse HEAD");
  // Where the whole PR starts. A follow-up's merge decision covers every commit on the
  // branch, not just its own, so a small addition can't merge an earlier change that
  // was held for review.
  const prBase = brief.prNumber
    ? must("git fetch -q origin main && git merge-base HEAD FETCH_HEAD")
    : base;

  // Resume the earlier agent session if this is its saved sandbox; otherwise start fresh.
  const resume =
    env.SANDBOX_FRESH === "0" ? (brief.resumeSessionId ?? undefined) : undefined;
  await step(resume ? "Picking up where I left off" : "Reading the code");
  let { final, sessionId } = await runAgent(prompt(), resume).catch((err) => {
    if (!resume) throw err;
    console.error("resume failed; starting a new session", err);
    return runAgent(prompt());
  });
  await report({ patch: { sessionId } });

  const changed = () =>
    must(`git add -A && git diff --cached --name-only ${base}`)
      .split("\n")
      .filter(Boolean);
  let files = changed();
  if (files.length === 0) {
    const { summary } = final;
    await report({ patch: { status: "answered", summary } });
    return;
  }

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
  files = changed();
  const { title, summary, details } = final;
  const commitTitle = title ?? brief.request.slice(0, 60);
  const touchesConvex = files.some((f) => f.startsWith("convex/"));

  writeFileSync(
    "/tmp/commit-msg",
    `${commitTitle}\n\nAsked by ${brief.requester} in #${brief.channel}: ${brief.threadUrl}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`,
  );
  must(`git commit -q -F /tmp/commit-msg`);
  const diff = sh(`git diff ${base} HEAD`, { quiet: true }).out;

  if (DRY) {
    console.log(`[dry run] would push ${branch}:\n${files.join("\n")}\n\n${summary}`);
    await report({ patch: { status: "pr", title: commitTitle, summary, files } });
    return;
  }

  await step(`Pushing ${branch}`);
  must(
    `git push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" HEAD:refs/heads/${branch}`,
  );

  let prNumber = brief.prNumber;
  let prUrl = prNumber ? `https://github.com/${REPO}/pull/${prNumber}` : "";
  if (prNumber) {
    await comment(GITHUB_TOKEN, prNumber, `Follow-up from ${brief.requester} ([thread](${brief.threadUrl})):\n\n> ${brief.request.replace(/\n/g, "\n> ")}\n\n${summary}${details ? `\n\n${details}` : ""}`);
  } else {
    await step("Opening a pull request");
    const pr = await createPr(GITHUB_TOKEN, {
      branch,
      title: commitTitle,
      body: `Asked by ${brief.requester} in #${brief.channel} ([thread](${brief.threadUrl})):\n\n> ${brief.request.replace(/\n/g, "\n> ")}\n\n${summary}${details ? `\n\n${details}` : ""}\n\nChecks: ${check.ok ? "typecheck and lint pass" : "**typecheck or lint failed**"}.${touchesConvex ? "\n\nChanges `convex/`: the production build deploys it on merge." : ""}\n\nOpened by @Claude from Just Write chat.`,
    });
    prNumber = pr.number;
    prUrl = pr.html_url;
  }

  const prFiles = brief.prNumber
    ? must(`git diff --name-only ${prBase} HEAD`).split("\n").filter(Boolean)
    : files;
  const prDiff = brief.prNumber ? sh(`git diff ${prBase} HEAD`, { quiet: true }).out : diff;
  const verdict = await decide(prFiles, check.ok, prDiff);
  const common = {
    title: commitTitle,
    summary,
    files,
    checksPassed: check.ok,
    touchesConvex,
    prNumber,
    prUrl,
    verdict: `${verdict.merge ? "merge" : "review"}: ${verdict.why}`,
  };
  if (verdict.merge) {
    await step("Merging");
    await mergePr(GITHUB_TOKEN, prNumber!, branch);
    await report({ patch: { ...common, status: "merged" } });
  } else {
    await report({
      patch: { ...common, status: "pr", previewUrl: previewUrlFor(branch) },
    });
  }
}

async function stopSandbox() {
  if (DRY || !env.IMPROVE_URL || !env.SANDBOX_NAME) return;
  await fetch(env.IMPROVE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.CONVEX_SERVER_SECRET, stop: env.SANDBOX_NAME }),
  }).catch(() => {});
}

main()
  .catch(async (err) => {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    await report({
      fail: true,
      patch: {
        status: "failed",
        error: redact(`Failed while ${lastStep.charAt(0).toLowerCase()}${lastStep.slice(1) || "starting"}: ${message.slice(0, 300)}`),
      },
    });
  })
  .finally(stopSandbox);
