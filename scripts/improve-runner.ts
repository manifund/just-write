// Runs one @Claude improvement inside a Vercel Sandbox (started by app/api/improve/route.ts).
// Installs deps, runs the Claude Agent SDK on the request, and checks the result. Steps are
// reported to Convex (convex/runner.ts), where Claude's card in the chat thread updates live,
// along with a light heartbeat of what the agent and its subagents are doing between steps
// and a detailed log for members (/improvements/<id>/log).
// When it's done it sends the list of changed files to /api/improve, which reads them out of
// the sandbox, pushes them, opens the PR, and decides whether it merges.
//
// The sandbox has no GitHub token or server secret, only RUN_TOKEN: a key for this run that
// stops working once it finishes. The agent can read anything this process can, so keep it
// that way.
//
// The route copies this file, scripts/improve-runner/ (its modules), and convex/lib/improve.ts
// out of the deployed commit into /tmp/improve-runner and runs it from there, with the clone as
// the working directory (RUNNER_FILES in app/api/improve/route.ts). So import only node
// built-ins, those modules, and dependency-free files next to them statically, with relative
// paths; the Agent SDK is loaded from the clone's node_modules after `bun install` runs.
//
// A chat task (brief.kind "chat", convex/chatTasks.ts) runs differently: the agent reads the
// club's data in /tmp/club and answers, and may post one message. Nothing is committed. Its
// sandbox is behind a firewall that only lets through the model API, Convex, and web reads
// (GET/HEAD, for WebFetch), so it loads
// the Agent SDK the route installed in /tmp/agent and sends its result to
// chatTasks.finish instead of /api/improve.
//
// Local dry run (no Convex reports, no push): IMPROVE_DRY_RUN=1 bun scripts/improve-runner.ts
import { existsSync, readFileSync } from "node:fs";
import {
  CHAT_DRAFT_MAX_CHARS,
  CHAT_POST_CHANNELS,
} from "../convex/lib/improve";
import { agentSession, runAgent, whoStopped } from "./improve-runner/agent";
import { checks } from "./improve-runner/checks";
import {
  AGENT_DIR,
  CHAT,
  CHAT_AGENT_MS,
  CLUB_DIR,
  DRY,
  EFFORT,
  RESUMED_SANDBOX,
  RESUMES_WORK,
  RUN_TOKEN,
  brief,
  env,
  startedAt,
} from "./improve-runner/context";
import {
  changedFiles,
  mergeInProgress,
  mergeMain,
  mergeNote,
  type ChangedFile,
  type Merge,
} from "./improve-runner/git";
import { prompt, type Final } from "./improve-runner/prompt";
import {
  currentStep,
  flushLogs,
  log,
  report,
  runnerMutation,
  step,
} from "./improve-runner/report";
import { must, sh } from "./improve-runner/shell";

// What this sends to /api/improve when it's done (lib/improve-finish.ts#RunnerResult).
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
      unfinished?: boolean; // the agent ran out of steps; never merged
      merged?: string; // main's commit, merged in: the site commits with it as a second parent
    };

const OUT_OF_TURNS = "I ran out of steps before finishing.";

// --- Chat tasks ---------------------------------------------------------------------------

// Why the agent's post can't be used as is, or null. The server checks again and drops a
// bad one rather than failing the run; this gives the agent one chance to fix it first.
function postProblem(post: Final["post"]) {
  if (!post) return null;
  let channels: string[] = [];
  try {
    const about = JSON.parse(
      readFileSync(`${CLUB_DIR}/about.json`, "utf8"),
    ) as {
      channels?: { slug: string }[];
    };
    channels = (about.channels ?? []).map((c) => c.slug);
  } catch {
    // No snapshot: skip the check.
  }
  if (!CHAT_POST_CHANNELS.includes(post.channel))
    return `"${post.channel}" isn’t a channel you can post in; use one of ${CHAT_POST_CHANNELS.join(", ")}`;
  if (channels.length && !channels.includes(post.channel))
    return `there's no #${post.channel} channel`;
  if (post.markdown.length > CHAT_DRAFT_MAX_CHARS)
    return `it’s ${post.markdown.length} characters, over the ${CHAT_DRAFT_MAX_CHARS} limit`;
  return null;
}

type ChatResult =
  | {
      outcome: "answered";
      summary: string;
      post?: { channel: string; markdown: string };
    }
  | { outcome: "failed"; error: string };

async function chatMain(): Promise<ChatResult> {
  // The route installed the Agent SDK in AGENT_DIR before the firewall went on.
  if (!existsSync(`${AGENT_DIR}/node_modules/@anthropic-ai/claude-agent-sdk`))
    throw new Error("The Agent SDK isn’t installed.");
  if (EFFORT) await step(`Using ${EFFORT} effort`);
  await step("Reading the club’s data");
  const first = await runAgent(prompt(), undefined, true);
  if (first.outOfTurns) throw new Error(OUT_OF_TURNS);
  let { final, sessionId } = first;
  const problem = postProblem(final.post);
  if (problem && Date.now() < startedAt + CHAT_AGENT_MS - 3 * 60 * 1000) {
    await step("Fixing the post");
    // If this fails, keep the first answer; the server drops a post it can't use.
    const fixed = await runAgent(
      `Your post can't be used: ${problem}. Fix it and return the structured result again.`,
      sessionId,
    ).catch((err) => {
      console.error("fixing the post failed", err);
      return null;
    });
    if (fixed && !fixed.outOfTurns) ({ final, sessionId } = fixed);
  }
  return { outcome: "answered", summary: final.summary, post: final.post };
}

// Sends a chat task's result to Convex (chatTasks.finish), which posts it and ends the run.
// A few tries: if it never gets through, the run is marked failed when it goes stale.
async function finishChat(result: ChatResult) {
  if (DRY)
    return console.log(
      "[dry run] would finish with",
      JSON.stringify(result, null, 2),
    );
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    if (await runnerMutation("chatTasks:finish", result)) return;
  }
  // Maybe the result itself was rejected; at least end the run. If an earlier try did get
  // through, the key is retired and this is refused.
  if (result.outcome === "answered")
    await runnerMutation("chatTasks:finish", {
      outcome: "failed",
      error: "Couldn’t save the answer.",
    });
}

async function main(): Promise<RunnerResult> {
  const { branch } = brief;
  await step("Installing dependencies");
  if (!sh("bun install --frozen-lockfile").ok) must("bun install");
  sh("bunx next typegen"); // the typecheck needs Next's generated route types

  // Picking up a failed follow-up on a PR in its saved sandbox: keep its edits if the branch
  // hasn't moved on GitHub since. (Without a PR the branch is only local; checkout -B below
  // keeps the working tree.)
  const keepEdits =
    RESUMES_WORK &&
    (!brief.prNumber ||
      (sh(`git fetch -q origin ${branch}`).ok &&
        must("git rev-parse HEAD") === must("git rev-parse FETCH_HEAD")));
  if (brief.prNumber && !keepEdits) {
    // A saved sandbox may already be on the branch; match GitHub either way.
    const fetched = sh(
      `git reset -q --hard && git clean -fdq && git fetch origin ${branch} && git checkout -B ${branch} FETCH_HEAD`,
    );
    if (!fetched.ok) throw new Error(`Couldn’t check out ${branch}.`);
  } else must(`git checkout -B ${branch}`);
  // The site commits the changes on top of this. For a follow-up it's the branch's head on
  // GitHub, and the route checks it still is.
  const base = must("git rev-parse HEAD");
  // Keep an open PR mergeable: bring main into its branch first.
  let merge: Merge | null = null;
  if (keepEdits) merge = mergeInProgress();
  else if (brief.prNumber) {
    await step("Merging the latest main into the branch");
    merge = mergeMain();
    if (merge?.conflicts.length)
      await step(`Resolving conflicts in ${merge.conflicts.length} file(s)`);
  }

  // Resume the earlier agent session if this is its saved sandbox; otherwise start fresh.
  const resume = RESUMED_SANDBOX
    ? (brief.resumeSessionId ?? undefined)
    : undefined;
  if (EFFORT) await step(`Using ${EFFORT} effort`);
  await step(
    resume
      ? "Picking up where I left off"
      : brief.restart
        ? "Starting over and reading the code"
        : "Reading the code",
  );
  let { final, sessionId, outOfTurns } = await runAgent(
    prompt(mergeNote(merge)),
    resume,
    true,
  ).catch((err) => {
    if (!resume) throw err;
    console.error("resume failed; starting a new session", err);
    log(
      "error",
      `Couldn’t resume the agent session, so starting a new one: ${err instanceof Error ? err.message : String(err)}`,
    );
    return runAgent(prompt(mergeNote(merge)), undefined, true);
  });

  if (changedFiles(base).length === 0) {
    if (whoStopped())
      return { outcome: "failed", error: `Stopped by ${whoStopped()}.` };
    if (outOfTurns) throw new Error(OUT_OF_TURNS);
    return { outcome: "answered", summary: final.summary };
  }

  await step("Running the typecheck and linter");
  let check = checks(merge);
  // Out of steps: push what's there as an unfinished PR for a follow-up to finish, without
  // spending more turns on fixes.
  // Stopped: the same, without asking the agent for anything more.
  for (
    let attempt = 0;
    !outOfTurns && !whoStopped() && !check.ok && attempt < 2;
    attempt++
  ) {
    await step("Fixing typecheck and lint errors");
    ({ final, sessionId, outOfTurns } = await runAgent(
      `The harness's checks failed:\n\n${check.output}\n\nFix these, run the checks again, and return the structured result again, covering the whole change.`,
      sessionId,
    ));
    await step("Running the typecheck and linter again");
    check = checks(merge);
  }
  const files = changedFiles(base);
  if (files.length === 0) {
    if (whoStopped())
      return { outcome: "failed", error: `Stopped by ${whoStopped()}.` };
    if (outOfTurns) throw new Error(OUT_OF_TURNS);
    return { outcome: "answered", summary: final.summary };
  }
  if (outOfTurns || whoStopped())
    return {
      outcome: "changes",
      base,
      files,
      title: final.title,
      summary: `${whoStopped() ? `Stopped by ${whoStopped()} before I finished.` : OUT_OF_TURNS} Reply @Claude continue to keep going.`,
      details: final.details,
      checksPassed: check.ok,
      unfinished: true,
      merged: merge?.main,
    };
  return {
    outcome: "changes",
    base,
    files,
    title: final.title,
    summary: final.summary,
    details: final.details,
    checksPassed: check.ok,
    merged: merge?.main,
  };
}

// Hands the result to /api/improve, which pushes it, updates the card, and stops this sandbox.
async function finish(result: RunnerResult) {
  if (DRY)
    return console.log(
      "[dry run] would finish with",
      JSON.stringify(result, null, 2),
    );
  try {
    const res = await fetch(env.IMPROVE_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: env.IMPROVEMENT_ID,
        runToken: RUN_TOKEN,
        finish: result,
      }),
    });
    if (!res.ok) console.error("finish failed", res.status, await res.text());
  } catch (err) {
    console.error("finish failed", err); // the run is marked failed when it goes stale
  }
}

function failure(err: unknown) {
  const lastStep = currentStep();
  console.error(err);
  log("error", err instanceof Error ? (err.stack ?? err.message) : String(err));
  const message =
    CHAT && Date.now() >= startedAt + CHAT_AGENT_MS
      ? "Ran out of time."
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    outcome: "failed" as const,
    error: `Failed while ${lastStep.charAt(0).toLowerCase()}${lastStep.slice(1) || "starting"}: ${message.slice(0, 300)}`,
  };
}

// Finishing retires this run's key, so send the rest of the log first.
async function flushThen<T extends { outcome: string }>(
  result: T,
  send: (r: T) => Promise<unknown>,
) {
  log("info", `Sending the result: ${result.outcome}`);
  await flushLogs();
  await send(result);
}

if (CHAT)
  chatMain()
    .catch(async (err): Promise<ChatResult> => {
      if (agentSession()) await report({ sessionId: agentSession() });
      return failure(err);
    })
    .then((result) => flushThen(result, finishChat));
else
  main()
    .catch(async (err): Promise<RunnerResult> => {
      // Usually saved already when the session started; make sure, before the key is retired.
      if (agentSession()) await report({ sessionId: agentSession() });
      return failure(err);
    })
    .then((result) => flushThen(result, finish));
