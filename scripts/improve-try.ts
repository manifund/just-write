// Smoke test for @Claude improvements: starts a Vercel Sandbox like /api/improve does, uploads
// your local runner, and runs it as a dry run (no Convex reports, no push, no PR). Streams logs,
// then shows the change the site would have pushed.
//   bun scripts/improve-try.ts "Add a tooltip to the Send button"
//   bun scripts/improve-try.ts --chat "chat task: how many essays came in this week?"
// --chat runs a chat task behind the same firewall as the real thing (lib/chat-task-sandbox.ts),
// on a few made-up members and essays instead of the club's data. It checks the setup, the
// firewall, and the model key the firewall adds; nothing is posted.
// Needs VERCEL_OIDC_TOKEN (vercel env pull) and OPENROUTER_API_KEY in .env.local.
import { readFileSync } from "node:fs";
import { Sandbox } from "@vercel/sandbox";
import { REPO, SANDBOX_ROOT, parseEffort } from "../convex/lib/improve";
import {
  KEY_PLACEHOLDER,
  SETUP,
  chatTaskPolicy,
} from "../lib/chat-task-sandbox";
import { CLUB_DIR, CLUB_README } from "../lib/club-snapshot";

const chat = process.argv[2] === "--chat";
const request =
  process.argv[chat ? 3 : 2] ??
  (chat
    ? "chat task: how many essays are there, and who wrote the longest? Post it in #published."
    : "Add a tooltip to the chat Send button that says “Enter to send”.");

// Made-up data in the shape lib/club-snapshot.ts writes.
const now = new Date().toISOString();
const sampleClub = {
  "about.json": {
    now,
    nowPt: now,
    askedBy: { name: "Austin", handle: "austin" },
    deadlines: [],
    channels: ["general", "check-ins", "published", "site"].map((slug) => ({
      slug,
      name: slug,
      description: "",
    })),
    truncated: false,
  },
  "members.json": [
    {
      name: "Ada Example",
      handle: "ada-example",
      bio: null,
      link: null,
      committedAt: now,
    },
    {
      name: "Ben Example",
      handle: "ben-example",
      bio: null,
      link: null,
      committedAt: now,
    },
  ],
  "essays.json": [
    {
      title: "On walking",
      url: "https://example.com/1",
      words: 1800,
      submittedAt: now,
      author: "Ada Example",
      handle: "ada-example",
      week: 1,
    },
    {
      title: "Notes on bread",
      url: "https://example.com/2",
      words: 950,
      submittedAt: now,
      author: "Ben Example",
      handle: "ben-example",
      week: 1,
    },
  ],
  "messages.json": [],
  "ideas.json": [],
  "events.json": [],
  "improvements.json": [],
};
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
  if (chat) {
    // As in app/api/improve/route.ts: set up, then the firewall, then the data.
    await sandbox.writeFiles(
      upload.map((p) => ({
        path: `${SANDBOX_ROOT}/${p}`,
        content: readFileSync(p),
      })),
    );
    const setup = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", SETUP],
      cwd: SANDBOX_ROOT,
    });
    if (setup.exitCode !== 0) throw new Error(await setup.stderr());
    const convexHost = new URL(
      process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://example.convex.cloud",
    ).host;
    await sandbox.update({
      networkPolicy: chatTaskPolicy(
        process.env.OPENROUTER_API_KEY!,
        convexHost,
      ),
    });
    console.log("firewall on");
  }
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
          kind: chat ? "chat" : null,
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
    ...(chat
      ? [
          { path: `${CLUB_DIR}/README.md`, content: Buffer.from(CLUB_README) },
          ...Object.entries(sampleClub).map(([name, value]) => ({
            path: `${CLUB_DIR}/${name}`,
            content: Buffer.from(JSON.stringify(value, null, 1)),
          })),
        ]
      : []),
  ]);
  const bun = await sandbox.runCommand("bash", [
    "-c",
    "command -v bun >/dev/null || curl -fsSL https://bun.sh/install | bash",
  ]);
  if (bun.exitCode !== 0) throw new Error(await bun.stderr());
  const run = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-c",
      'export PATH="$HOME/.bun/bin:$PATH"; bun scripts/improve-runner.ts',
    ],
    cwd: SANDBOX_ROOT,
    env: {
      IMPROVE_DRY_RUN: "1",
      OPENROUTER_API_KEY: chat
        ? KEY_PLACEHOLDER
        : process.env.OPENROUTER_API_KEY!,
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
  console.log("exit", run.exitCode);
  if (!chat) {
    const show = await sandbox.runCommand("git", [
      "-C",
      SANDBOX_ROOT,
      "diff",
      "--cached",
      "HEAD",
    ]);
    console.log(await show.stdout());
  }
} finally {
  await sandbox.stop();
}
