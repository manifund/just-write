// Smoke test for @Claude improvements: starts a Vercel Sandbox like /api/improve does, uploads
// your local runner, and runs it as a dry run (no Convex reports, no push, no PR). Streams logs.
//   bun scripts/improve-try.ts "Add a tooltip to the Send button"
//   bun scripts/improve-try.ts --chat "How many essays came in this week?"
// --chat runs a chat task behind the same firewall as the real thing (lib/chat-task-sandbox.ts),
// on a few made-up members and essays instead of the club's data, so it checks the firewall,
// the Agent SDK install, and the model key the firewall adds.
// Needs VERCEL_OIDC_TOKEN (vercel env pull) and OPENROUTER_API_KEY in .env.local.
import { readFileSync } from "node:fs";
import { Sandbox } from "@vercel/sandbox";
import { REPO, SANDBOX_ROOT } from "../convex/lib/improve";
import { KEY_PLACEHOLDER, chatTaskPolicy } from "../lib/chat-task-sandbox";
import { CLUB_DIR, CLUB_README } from "../lib/club-snapshot";

const chat = process.argv[2] === "--chat";
const request =
  process.argv[chat ? 3 : 2] ??
  (chat
    ? "chat task: how many essays are there, and who wrote the longest?"
    : "Add a tooltip to the chat Send button that says “Enter to send”.");
const upload = [
  "scripts/improve-runner.ts",
  "lib/github.ts",
  "convex/lib/improve.ts",
  "package.json",
  "bun.lock",
];

// Made-up data in the shape lib/club-snapshot.ts writes.
const now = new Date().toISOString();
const sampleClub = {
  "about.json": {
    now,
    nowPt: now,
    askedBy: { name: "Austin", handle: "austin" },
    deadlines: [],
    channels: [
      { slug: "general", name: "general", description: "" },
      { slug: "check-ins", name: "check-ins", description: "" },
      { slug: "published", name: "published", description: "" },
    ],
    truncated: false,
  },
  "members.json": [
    { name: "Ada Example", handle: "ada-example", bio: null, link: null, committedAt: now },
    { name: "Ben Example", handle: "ben-example", bio: null, link: null, committedAt: now },
  ],
  "essays.json": [
    { title: "On walking", url: "https://example.com/1", words: 1800, submittedAt: now, author: "Ada Example", handle: "ada-example", week: 1 },
    { title: "Notes on bread", url: "https://example.com/2", words: 950, submittedAt: now, author: "Ben Example", handle: "ben-example", week: 1 },
  ],
  "messages.json": [],
  "ideas.json": [],
  "events.json": [],
  "improvements.json": [],
};

const sandbox = await Sandbox.create({
  source: { type: "git", url: `https://github.com/${REPO}.git`, depth: 1 },
  resources: { vcpus: chat ? 2 : 4 },
  timeout: 30 * 60 * 1000,
  persistent: false,
});
console.log("sandbox", sandbox.name);
try {
  if (chat) {
    const convexHost = new URL(process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://example.convex.cloud").host;
    await sandbox.update({
      networkPolicy: chatTaskPolicy(process.env.OPENROUTER_API_KEY!, convexHost),
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
    args: ["-c", 'export PATH="$HOME/.bun/bin:$PATH"; bun scripts/improve-runner.ts'],
    cwd: SANDBOX_ROOT,
    env: {
      IMPROVE_DRY_RUN: "1",
      OPENROUTER_API_KEY: chat ? KEY_PLACEHOLDER : process.env.OPENROUTER_API_KEY!,
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
  console.log("exit", run.exitCode);
  if (!chat) {
    const show = await sandbox.runCommand("git", ["-C", SANDBOX_ROOT, "show", "HEAD"]);
    console.log(await show.stdout());
  }
} finally {
  await sandbox.stop();
}
