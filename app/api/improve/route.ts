// Starts (or stops) the Vercel Sandbox for an @Claude improvement. Convex calls this right
// after someone mentions Claude (convex/improvements.ts#kick); the runner inside the sandbox
// calls it again with `stop` when it's done. Both are guarded by CONVEX_SERVER_SECRET.
//
// The run itself (install, agent, checks, push, PR) happens in scripts/improve-runner.ts,
// detached inside the sandbox, so it can take longer than this function is allowed to.
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
  sandboxNameFor,
} from "@/convex/lib/improve";
import { serverSecret } from "@/lib/auth-server";
import { KEY_PLACEHOLDER, SETUP, chatTaskPolicy } from "@/lib/chat-task-sandbox";
import { readClub } from "@/lib/club-snapshot";
import { pickTarget } from "@/lib/improve-target";

export const maxDuration = 300;

const RUN_TIMEOUT_MS = 40 * 60 * 1000;
// The runner gives the agent 15 minutes (scripts/improve-runner.ts) and convex reaps chat
// tasks after 30 (improvements.reapStale).
const CHAT_TIMEOUT_MS = 25 * 60 * 1000;
const INSTALL_BUN =
  "command -v bun >/dev/null || [ -x ~/.bun/bin/bun ] || curl -fsSL https://bun.sh/install | bash";
// Three tries in total, waiting 10s and then 30s between them (well under maxDuration).
const START_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [10_000, 30_000];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    secret?: string;
    id?: string;
    stop?: string;
  } | null;
  if (!body || body.secret !== serverSecret())
    return new Response("Forbidden", { status: 403 });

  if (body.stop) {
    const sandbox = await Sandbox.get({ name: body.stop }).catch(() => null);
    await sandbox?.stop().catch(() => {});
    return Response.json({ ok: true });
  }

  const id = body.id as Id<"improvements">;
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const secret = serverSecret();
  // Chat tasks keep this token as their sandbox's only credential (convex/chatTasks.ts).
  const token = randomBytes(32).toString("hex");
  const claimed = await convex.mutation(api.server.claimImprovement, {
    secret,
    id,
    token,
  });
  if (!claimed) return Response.json({ ok: true, skipped: true });
  const brief = { ...claimed };

  const report = (
    args: Omit<
      FunctionArgs<typeof api.server.reportImprovement>,
      "secret" | "id"
    >,
  ) =>
    convex.mutation(api.server.reportImprovement, { secret, id, ...args });

  if (brief.kind === "chat") return await runChatTask(token);

  // Continue one of the thread's open PRs, or start a new one, depending on what was asked.
  // Decided before the sandbox starts, since each branch has its own saved sandbox.
  if (!brief.prNumber && brief.openPrs.length > 0) {
    const target = await pickTarget(brief);
    console.log("improve: target", id, target.pr?.prNumber ?? "new", target.why);
    const continued = target.pr
      ? await convex.mutation(api.server.continuePr, {
          secret,
          id,
          previousId: target.pr.id as Id<"improvements">,
        })
      : null;
    if (continued) {
      Object.assign(brief, continued);
      await report({ step: `Continuing PR #${continued.prNumber}` }).catch(() => {});
    } else await report({ step: "Starting a new PR" }).catch(() => {});
  }
  await report({ step: "Starting a sandbox" }).catch(() => {});

  // Starting a sandbox sometimes fails for a moment (Vercel hiccups, the last run's
  // sandbox still stopping), so try a few times before giving up.
  let lastError: unknown;
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await report({
        step: `Couldn’t start the sandbox, trying again (${attempt + 1} of ${START_ATTEMPTS})`,
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const sandbox = await startSandbox();
      return Response.json({ ok: true, sandbox: sandbox.name, attempt: attempt + 1 });
    } catch (err) {
      lastError = err;
      console.error(`improve: couldn't start (attempt ${attempt + 1})`, id, err);
    }
  }
  console.error("improve: giving up", id, lastError);
  await report({
    fail: true,
    patch: { status: "failed", error: "Couldn’t start a sandbox." },
  });
  return new Response("Couldn't start", { status: 500 });

  // A chat task (convex/chatTasks.ts): read the club's data once, here, then start a
  // throwaway sandbox that gets the data, a token good only for this run, and no server
  // secret, GitHub token, or OpenRouter key. A firewall cuts it off from the internet
  // before anything is written to it, apart from the model API (the firewall adds the
  // key to those requests) and the Convex backend.
  async function runChatTask(token: string) {
    let files;
    try {
      await report({ step: "Reading the club’s chat, essays, and calendar" });
      const club = await readClub(convex, { secret, id, token });
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
    const began = Date.now();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        // A second try that can't finish within this function's 300s would leave the run stuck.
        if (Date.now() - began > 140_000) break;
        await report({
          step: "Couldn’t start the sandbox, trying again (2 of 2)",
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[0]));
      }
      try {
        const sandbox = await startChatSandbox(token, files);
        return Response.json({ ok: true, sandbox: sandbox.name, attempt: attempt + 1 });
      } catch (err) {
        lastError = err;
        console.error(`improve: couldn't start chat task (attempt ${attempt + 1})`, id, err);
      }
    }
    console.error("improve: giving up", id, lastError);
    await report({
      fail: true,
      patch: { status: "failed", error: "Couldn’t start a sandbox." },
    });
    return new Response("Couldn't start", { status: 500 });
  }

  async function startChatSandbox(
    token: string,
    files: { path: string; content: Buffer }[],
  ): Promise<Sandbox> {
    const key = process.env.OPENROUTER_API_KEY ?? "";
    let sandbox: Sandbox | null = null;
    try {
      sandbox = await Sandbox.create({
        source: { type: "git", url: `https://github.com/${REPO}.git`, depth: 1 },
        resources: { vcpus: 2 },
        timeout: CHAT_TIMEOUT_MS,
        persistent: false,
      });
      await report({ patch: { sandboxId: sandbox.name } });
      // Installed while the sandbox holds nothing but the public repo, so the firewall
      // doesn't need to let package hosts through.
      await report({ step: "Getting ready" }).catch(() => {});
      const setup = await sandbox.runCommand({
        cmd: "bash",
        args: ["-c", SETUP],
        cwd: SANDBOX_ROOT,
        signal: AbortSignal.timeout(120_000),
      });
      if (setup.exitCode !== 0)
        throw new Error(`setup failed: ${(await setup.stderr()).slice(-500)}`);
      // Throws if it can't be applied, which fails this attempt before any data is written.
      await sandbox.update({
        networkPolicy: chatTaskPolicy(key, new URL(process.env.NEXT_PUBLIC_CONVEX_URL!).host),
      });
      await sandbox.writeFiles([
        { path: "/tmp/brief.json", content: Buffer.from(JSON.stringify(brief)) },
        ...files,
      ]);
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          'export PATH="$HOME/.bun/bin:$PATH"; bun scripts/improve-runner.ts > /tmp/runner.log 2>&1',
        ],
        cwd: SANDBOX_ROOT,
        detached: true,
        env: {
          IMPROVEMENT_ID: id,
          RUN_TOKEN: token,
          CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL!,
          // The firewall swaps in the real key on the way out (chatTaskPolicy).
          OPENROUTER_API_KEY: KEY_PLACEHOLDER,
        },
      });
      return sandbox;
    } catch (err) {
      await sandbox?.stop().catch(() => {});
      throw err;
    }
  }

  async function startSandbox(): Promise<Sandbox> {
    let sandbox: Sandbox | null = null;
    let fresh = false;
    try {
      // Follow-ups on the same branch get the saved sandbox back (if it's under 24h old).
      sandbox = await Sandbox.getOrCreate({
        name: sandboxNameFor(brief.branch),
        source: { type: "git", url: `https://github.com/${REPO}.git`, depth: 50 },
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
        { path: "/tmp/brief.json", content: Buffer.from(JSON.stringify(brief)) },
      ]);
      const bun = await sandbox.runCommand("bash", ["-c", INSTALL_BUN]);
      if (bun.exitCode !== 0) throw new Error(`bun install failed: ${await bun.stderr()}`);

      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          'export PATH="$HOME/.bun/bin:$PATH"; bun scripts/improve-runner.ts > /tmp/runner.log 2>&1',
        ],
        cwd: SANDBOX_ROOT,
        detached: true,
        env: {
          IMPROVEMENT_ID: id,
          SANDBOX_FRESH: fresh ? "1" : "0",
          SANDBOX_NAME: sandbox.name,
          CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL!,
          CONVEX_SERVER_SECRET: secret,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
          OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
          IMPROVE_URL: new URL("/api/improve", req.url).toString(),
        },
      });
      return sandbox;
    } catch (err) {
      await sandbox?.stop().catch(() => {});
      throw err;
    }
  }
}
