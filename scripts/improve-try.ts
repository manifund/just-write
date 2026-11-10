// Smoke test for @Claude improvements: starts a Vercel Sandbox like /api/improve does, uploads
// your local runner, and runs it as a dry run (no Convex reports, no push, no PR). Streams logs,
// then shows the change the site would have pushed.
//   bun scripts/improve-try.ts "Add a tooltip to the Send button"
// Needs VERCEL_OIDC_TOKEN (vercel env pull) and OPENROUTER_API_KEY in .env.local.
import { readFileSync } from "node:fs";
import { Sandbox } from "@vercel/sandbox";
import { REPO, SANDBOX_ROOT, parseEffort } from "../convex/lib/improve";

const request = process.argv[2] ?? "Add a tooltip to the chat Send button that says “Enter to send”.";
const upload = [
  "scripts/improve-runner.ts",
  "convex/lib/improve.ts",
  "package.json",
  "bun.lock",
];

const sandbox = await Sandbox.create({
  source: { type: "git", url: `https://github.com/${REPO}.git`, depth: 1 },
  resources: { vcpus: 4 },
  timeout: 30 * 60 * 1000,
  persistent: false,
});
console.log("sandbox", sandbox.name);
try {
  await sandbox.writeFiles([
    ...upload.map((p) => ({
      path: `${SANDBOX_ROOT}/${p}`,
      content: readFileSync(p),
    })),
    {
      path: "/tmp/brief.json",
      content: Buffer.from(
        JSON.stringify({
          number: 0,
          branch: "claude/try",
          prNumber: null,
          resumeSessionId: null,
          effort: parseEffort(request) ?? null,
          request,
          requester: "Austin",
          channel: "site",
          threadUrl: "https://justwrite.club/chat/site",
          thread: [{ author: "Austin", text: request, at: Date.now() }],
        }),
      ),
    },
  ]);
  const bun = await sandbox.runCommand("bash", [
    "-c",
    "command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash",
  ]);
  if (bun.exitCode !== 0) throw new Error(await bun.stderr());
  const run = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", 'export PATH="$HOME/.bun/bin:$PATH"; bun scripts/improve-runner.ts'],
    cwd: SANDBOX_ROOT,
    env: {
      IMPROVE_DRY_RUN: "1",
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY!,
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
  console.log("exit", run.exitCode);
  const show = await sandbox.runCommand("git", ["-C", SANDBOX_ROOT, "diff", "--cached", "HEAD"]);
  console.log(await show.stdout());
} finally {
  await sandbox.stop();
}
