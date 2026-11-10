// Starts and finishes the Vercel Sandbox for an @Claude improvement. Convex calls this right
// after someone mentions Claude (convex/improvements.ts#kick), guarded by CONVEX_SERVER_SECRET.
// The runner inside the sandbox calls it again with `finish` when it's done, guarded by the
// run's own key.
//
// The agent and the checks run in scripts/improve-runner.ts, detached inside the sandbox, so
// they can take longer than this function is allowed to. The sandbox gets no site secrets
// (no GitHub token, no CONVEX_SERVER_SECRET): members steer the agent in it, so anything in
// there could be read out. It gets a random key that only works for its own run while it's
// going (convex/runner.ts). Pushing, the PR, and the merge decision happen here, in
// lib/improve-finish.ts.
import { randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  REPO,
  SANDBOX_KEEP_MS,
  SANDBOX_ROOT,
  hashRunToken,
  sandboxNameFor,
} from "@/convex/lib/improve";
import { serverSecret } from "@/lib/auth-server";
import {
  KEY_PLACEHOLDER,
  SETUP,
  chatTaskPolicy,
} from "@/lib/chat-task-sandbox";
import { readClub } from "@/lib/club-snapshot";
import { finishRun, parseResult } from "@/lib/improve-finish";
import { pickTarget } from "@/lib/improve-target";

export const maxDuration = 300;

const RUN_TIMEOUT_MS = 40 * 60 * 1000;
// Chat tasks: the runner gives the agent 15 minutes (scripts/improve-runner.ts), and Convex
// reaps them after 30 (improvements.reapStale).
const CHAT_TIMEOUT_MS = 25 * 60 * 1000;
// Three tries in total, waiting 10s and then 30s between them (well under maxDuration).
const START_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [10_000, 30_000];

// The runner is always the one from the commit this site was deployed from, not whatever is
// in the sandbox's clone (a saved sandbox is on a PR's branch, which can have an older one).
const RUNNER_DIR = "/tmp/improve-runner";
const RUNNER_REF = /^[0-9a-f]{40}$/.test(
  process.env.VERCEL_GIT_COMMIT_SHA ?? "",
)
  ? process.env.VERCEL_GIT_COMMIT_SHA!
  : "main";

type Body = {
  secret?: string;
  id?: string;
  stop?: string; // a chat task's sandbox, stopped by Convex when its run ends
  runToken?: string;
  finish?: unknown;
};

function reporter(convex: ConvexHttpClient, id: Id<"improvements">) {
  return (
    args: Omit<
      FunctionArgs<typeof api.server.reportImprovement>,
      "secret" | "id"
    >,
  ) =>
    convex.mutation(api.server.reportImprovement, {
      secret: serverSecret(),
      id,
      ...args,
    });
}

export async function POST(req: Request) {
  const requestStart = Date.now();
  const raw: unknown = await req.json().catch(() => null);
  const body = raw && typeof raw === "object" ? (raw as Body) : null;
  if (body && "finish" in body) return await finish(body);
  if (!body || body.secret !== serverSecret())
    return new Response("Forbidden", { status: 403 });

  if (typeof body.stop === "string") {
    const sandbox = await Sandbox.get({ name: body.stop }).catch(() => null);
    await sandbox?.stop().catch(() => {});
    return Response.json({ ok: true });
  }

  const id = body.id as Id<"improvements">;
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const secret = serverSecret();
  // The sandbox's key for this run. Convex only keeps its hash.
  const runToken = randomBytes(32).toString("base64url");
  const claimed = await convex.mutation(api.server.claimImprovement, {
    secret,
    id,
    runTokenHash: await hashRunToken(runToken),
  });
  if (!claimed) return Response.json({ ok: true, skipped: true });
  const brief = { ...claimed };
  const report = reporter(convex, id);
  if (brief.kind === "chat") return await runChatTask();

  // Continue one of the thread's open PRs or a run that failed partway, or start a new PR,
  // depending on what was asked. Decided before the sandbox starts, since each branch has
  // its own saved sandbox.
  if (!brief.prNumber && (brief.openPrs.length > 0 || brief.failedRun)) {
    const target = await pickTarget(brief);
    console.log(
      "improve: target",
      id,
      target.pr?.prNumber ?? "new",
      target.why,
    );
    const continued = target.pr
      ? await convex.mutation(api.server.continuePr, {
          secret,
          id,
          previousId: target.pr.id as Id<"improvements">,
        })
      : null;
    if (continued) {
      Object.assign(brief, continued);
      const label = continued.resumesFailedRun
        ? `Picking up run #${continued.resumesFailedRun}`
        : `Continuing PR #${continued.prNumber}`;
      await report({ step: label }).catch(() => {});
    } else await report({ step: "Starting a new PR" }).catch(() => {});
  }
  await report({ step: "Starting a sandbox" }).catch(() => {});

  // Starting a sandbox sometimes fails for a moment (Vercel hiccups, the last run's
  // sandbox still stopping), so try a few times before giving up.
  let lastError: unknown;
  let resumeFailed = false;
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await report({
        step: `Couldn’t start the sandbox, trying again (${attempt + 1} of ${START_ATTEMPTS})`,
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      // A saved sandbox that failed once (for example its snapshot is gone) gets replaced.
      const sandbox = await startSandbox({ discardSaved: resumeFailed });
      return Response.json({
        ok: true,
        sandbox: sandbox.name,
        attempt: attempt + 1,
      });
    } catch (err) {
      lastError = err;
      console.error(
        `improve: couldn't start (attempt ${attempt + 1})`,
        id,
        err,
      );
    }
  }
  console.error("improve: giving up", id, lastError);
  await report({
    fail: true,
    patch: { status: "failed", error: "Couldn’t start a sandbox." },
  });
  return new Response("Couldn't start", { status: 500 });

  // A chat task (convex/chatTasks.ts): read the club's data once, here, then start a
  // throwaway sandbox for it. Bun, the Agent SDK, and the runner go in while the sandbox
  // holds only the public repo; then a firewall cuts it off from everything but the model
  // API (which gets our key added on the way out, so the sandbox never has it), Convex,
  // and read-only (GET/HEAD) requests to the web, for WebSearch/WebFetch; only then are the data and the run's key written. It finishes through
  // chatTasks.finish, not through this route, since the firewall blocks POSTs to it.
  async function runChatTask() {
    let files;
    try {
      await report({ step: "Reading the club’s chat, essays, and calendar" });
      const club = await readClub(convex, { secret, id, token: runToken });
      console.log("improve: club snapshot", id, club.counts);
      files = club.files;
    } catch (err) {
      console.error("improve: couldn't read the club's data", id, err);
      await report({
        fail: true,
        patch: { status: "failed", error: "Couldn’t read the club’s data." },
      });
      return new Response("Couldn't read the club's data", { status: 500 });
    }
    await report({ step: "Starting a sandbox" }).catch(() => {});
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        // A second try (up to ~150s) that can't finish within this function's 300s would
        // leave the run stuck until it's reaped.
        if (Date.now() - requestStart > 130_000) break;
        await report({
          step: "Couldn’t start the sandbox, trying again (2 of 2)",
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[0]));
      }
      try {
        const sandbox = await startChatSandbox(files);
        return Response.json({
          ok: true,
          sandbox: sandbox.name,
          attempt: attempt + 1,
        });
      } catch (err) {
        lastError = err;
        console.error(
          `improve: couldn't start chat task (attempt ${attempt + 1})`,
          id,
          err,
        );
      }
    }
    console.error("improve: giving up", id, lastError);
    await report({
      fail: true,
      patch: { status: "failed", error: "Couldn’t start a sandbox." },
    });
    return new Response("Couldn't start", { status: 500 });
  }

  async function startChatSandbox(files: { path: string; content: Buffer }[]) {
    let sandbox: Sandbox | null = null;
    try {
      sandbox = await Sandbox.create({
        source: {
          type: "git",
          url: `https://github.com/${REPO}.git`,
          depth: 1,
        },
        resources: { vcpus: 2 },
        timeout: CHAT_TIMEOUT_MS,
        persistent: false,
      });
      await report({ patch: { sandboxId: sandbox.name } });
      await report({ step: "Getting ready" }).catch(() => {});
      const setup = await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `set -eo pipefail; ${SETUP}; cd ${SANDBOX_ROOT}; rm -rf ${RUNNER_DIR}; mkdir -p ${RUNNER_DIR}; git fetch -q --depth=1 origin ${RUNNER_REF}; git archive FETCH_HEAD scripts/improve-runner.ts convex/lib/improve.ts | tar -x -C ${RUNNER_DIR}`,
        ],
        cwd: SANDBOX_ROOT,
        signal: AbortSignal.timeout(120_000),
      });
      if (setup.exitCode !== 0)
        throw new Error(`setup failed: ${(await setup.stderr()).slice(-500)}`);
      // Throws if it can't be applied, which fails this attempt before any data is written.
      await sandbox.update({
        networkPolicy: chatTaskPolicy(
          process.env.OPENROUTER_API_KEY ?? "",
          new URL(process.env.NEXT_PUBLIC_CONVEX_URL!).host,
        ),
      });
      await sandbox.writeFiles([
        {
          path: "/tmp/brief.json",
          content: Buffer.from(JSON.stringify(brief)),
        },
        ...files,
      ]);
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `export PATH="$HOME/.bun/bin:$PATH"; bun ${RUNNER_DIR}/scripts/improve-runner.ts > /tmp/runner.log 2>&1`,
        ],
        cwd: SANDBOX_ROOT,
        detached: true,
        env: {
          IMPROVEMENT_ID: id,
          RUN_TOKEN: runToken,
          CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL!,
          // The firewall swaps in the real key on the way out (lib/chat-task-sandbox.ts).
          OPENROUTER_API_KEY: KEY_PLACEHOLDER,
        },
      });
      return sandbox;
    } catch (err) {
      await sandbox?.stop().catch(() => {});
      throw err;
    }
  }

  async function startSandbox({
    discardSaved,
  }: {
    discardSaved: boolean;
  }): Promise<Sandbox> {
    let sandbox: Sandbox | null = null;
    let fresh = false;
    try {
      const name = sandboxNameFor(brief.branch);
      if (discardSaved) {
        const saved = await Sandbox.get({ name }).catch(() => null);
        await saved?.delete().catch(() => {});
      }
      // Follow-ups on the same branch get the saved sandbox back (if it's under 24h old).
      // `resume: true` starts it here, so an expired snapshot shows up inside getOrCreate,
      // which then makes a fresh sandbox. Without it the VM starts on the first command,
      // and an expired snapshot fails every attempt.
      sandbox = await Sandbox.getOrCreate({
        name,
        resume: true,
        source: {
          type: "git",
          url: `https://github.com/${REPO}.git`,
          depth: 50,
        },
        resources: { vcpus: 4 },
        timeout: RUN_TIMEOUT_MS,
        persistent: true,
        snapshotExpiration: SANDBOX_KEEP_MS,
        keepLastSnapshots: { count: 1 },
        onCreate: async () => {
          fresh = true;
        },
      });
      if (!fresh) {
        await sandbox.update({ timeout: RUN_TIMEOUT_MS });
        await report({ step: "Resuming the sandbox from last time" });
      }
      await report({ patch: { sandboxId: sandbox.name } });

      await sandbox.writeFiles([
        {
          path: "/tmp/brief.json",
          content: Buffer.from(JSON.stringify(brief)),
        },
      ]);
      const bun = await sandbox.runCommand("bash", [
        "-c",
        "command -v bun >/dev/null || [ -x ~/.bun/bin/bun ] || curl -fsSL https://bun.sh/install | bash",
      ]);
      if (bun.exitCode !== 0)
        throw new Error(`bun install failed: ${await bun.stderr()}`);

      const runner = await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `set -e; rm -rf ${RUNNER_DIR}; mkdir -p ${RUNNER_DIR}; git fetch -q --depth=1 origin ${RUNNER_REF}; git archive FETCH_HEAD scripts/improve-runner.ts convex/lib/improve.ts | tar -x -C ${RUNNER_DIR}`,
        ],
        cwd: SANDBOX_ROOT,
      });
      if (runner.exitCode !== 0)
        throw new Error(`couldn't fetch the runner: ${await runner.stderr()}`);

      // No GitHub token or server secret here (see the top of this file). The OpenRouter key
      // is the agent's own API key, so it can't be kept from it.
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `export PATH="$HOME/.bun/bin:$PATH"; bun ${RUNNER_DIR}/scripts/improve-runner.ts > /tmp/runner.log 2>&1`,
        ],
        cwd: SANDBOX_ROOT,
        detached: true,
        env: {
          IMPROVEMENT_ID: id,
          RUN_TOKEN: runToken,
          SANDBOX_FRESH: fresh ? "1" : "0",
          CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL!,
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
          IMPROVE_URL: new URL("/api/improve", req.url).toString(),
        },
      });
      return sandbox;
    } catch (err) {
      if (sandbox && !fresh) resumeFailed = true;
      await sandbox?.stop().catch(() => {});
      throw err;
    }
  }
}

// The runner is done: push its changes and open the PR (or record its answer or failure),
// then stop the sandbox. Each run's key works once; Convex retires it in startFinish.
async function finish(body: Body) {
  if (typeof body.id !== "string" || typeof body.runToken !== "string")
    return new Response("Forbidden", { status: 403 });
  const id = body.id as Id<"improvements">;
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const run = await convex
    .mutation(api.server.startFinish, {
      secret: serverSecret(),
      id,
      runToken: body.runToken,
    })
    .catch(() => null);
  if (!run) return new Response("Forbidden", { status: 403 });
  const report = reporter(convex, id);

  try {
    const result = parseResult(body.finish) ?? {
      outcome: "failed" as const,
      error: "The sandbox sent back something I couldn’t read.",
    };
    await finishRun(run, result, report);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("improve: finishing failed", id, err);
    const message = err instanceof Error ? err.message : String(err);
    await report({
      fail: true,
      patch: {
        status: "failed",
        error: `Failed while pushing: ${message.slice(0, 300)}`,
      },
    }).catch(() => {});
    return new Response("Couldn't finish", { status: 500 });
  } finally {
    if (run.sandboxId) {
      const sandbox = await Sandbox.get({ name: run.sandboxId }).catch(
        () => null,
      );
      await sandbox?.stop().catch(() => {});
    }
  }
}
