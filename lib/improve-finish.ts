// Finishes an @Claude run on the server, after the sandbox says it's done. The sandbox holds no
// GitHub token and no server secret, so this is where its work gets pushed: read the changed
// files out of the sandbox, commit them through GitHub's API, open (or update) the PR, and
// decide whether it merges. Called by app/api/improve/route.ts.
//
// The sandbox's report is untrusted (the agent in it could have rewritten the runner), so the
// merge decision looks at what GitHub says the branch changes, not at what the sandbox claims.
import { Sandbox } from "@vercel/sandbox";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import {
  CLASSIFIER_MODEL,
  CONVEX_AUTODEPLOY,
  MERGE_POLICY,
  REPO,
  SANDBOX_ROOT,
  SENSITIVE_PATHS,
  previewUrlFor,
} from "@/convex/lib/improve";
import {
  branchHead,
  comment,
  commitFiles,
  compareWithMain,
  createPr,
  getPr,
  isOnMain,
  mergePr,
  updatePr,
  type FileChange,
} from "@/lib/github";
import { withTimeLimit } from "@/lib/time-limit";

// What the runner sends back (scripts/improve-runner.ts#RunnerResult).
export type RunnerResult =
  | { outcome: "answered"; summary: string }
  | { outcome: "failed"; error: string }
  | {
      outcome: "changes";
      base: string; // the commit the sandbox's changes are on top of
      files: { path: string; mode: "100644" | "100755" | null }[]; // null mode: deleted
      title: string | null;
      summary: string;
      details: string;
      checksPassed: boolean;
      unfinished?: boolean; // the agent ran out of steps: open the PR, never merge it
      merged?: string; // main's commit, merged into the branch: becomes the commit's second parent
    };

const UNFINISHED = "(unfinished)";

type Run = NonNullable<FunctionReturnType<typeof api.server.startFinish>>;
type Report = (
  args: Omit<
    FunctionArgs<typeof api.server.reportImprovement>,
    "secret" | "id"
  >,
) => Promise<unknown>;

const MAX_FILES = 300;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Limits for each Sandbox call (lib/time-limit.ts): its API can hang without answering.
const LOOKUP_MS = 20_000;
const READ_MS = 30_000;

const str = (x: unknown, max: number) =>
  typeof x === "string" ? x.trim().slice(0, max) : "";

// A repo-relative path that can't point outside the repo or into .git.
function safePath(p: unknown): p is string {
  if (typeof p !== "string" || !p || p.length > 400) return false;
  if (p.startsWith("/") || /[\0\\]/.test(p)) return false;
  const parts = p.split("/");
  return (
    parts.every((s) => s && s !== "." && s !== "..") && parts[0] !== ".git"
  );
}

// Checks the shape of what the sandbox sent. Null if it isn't something we can use.
export function parseResult(x: unknown): RunnerResult | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.outcome === "answered")
    return { outcome: "answered", summary: str(o.summary, 4000) };
  if (o.outcome === "failed")
    return { outcome: "failed", error: str(o.error, 500) || "The run failed." };
  if (o.outcome !== "changes") return null;
  if (typeof o.base !== "string" || !/^[0-9a-f]{40}$/.test(o.base)) return null;
  if (
    !Array.isArray(o.files) ||
    o.files.length === 0 ||
    o.files.length > MAX_FILES
  )
    return null;
  const files: Extract<RunnerResult, { outcome: "changes" }>["files"] = [];
  for (const f of o.files as Record<string, unknown>[]) {
    if (!f || !safePath(f.path)) return null;
    if (f.mode !== "100644" && f.mode !== "100755" && f.mode !== null)
      return null;
    files.push({ path: f.path, mode: f.mode });
  }
  return {
    outcome: "changes",
    base: o.base,
    files,
    title: str(o.title, 100) || null,
    summary: str(o.summary, 4000),
    details: str(o.details, 20_000),
    checksPassed: o.checksPassed === true,
    unfinished: o.unfinished === true,
    merged:
      typeof o.merged === "string" && /^[0-9a-f]{40}$/.test(o.merged)
        ? o.merged
        : undefined,
  };
}

export async function finishRun(
  run: Run,
  result: RunnerResult,
  report: Report,
) {
  if (result.outcome === "answered") {
    await report({ patch: { status: "answered", summary: result.summary } });
    return;
  }
  if (result.outcome === "failed") {
    await report({
      fail: true,
      patch: { status: "failed", error: result.error },
    });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN isn’t set.");
  const { branch, request, requester, channel, threadUrl } = run;
  const { summary, details, checksPassed, unfinished } = result;
  const title = result.title ?? request.slice(0, 60);

  await report({ step: `Pushing ${branch}` });
  const changes = await readChanges(run.sandboxId, result.files);
  // A follow-up builds on the branch as it is on GitHub; anything else would need a force push.
  const parent = run.prNumber ? await branchHead(token, branch) : result.base;
  if (!parent) throw new Error(`${branch} is gone from GitHub.`);
  if (parent !== result.base)
    throw new Error(`${branch} changed on GitHub while I was working.`);
  // A merge of main only counts if the commit really is on main (the sandbox says which).
  if (result.merged && !(await isOnMain(token, result.merged)))
    throw new Error("The commit I merged isn’t on main.");
  await commitFiles(token, {
    branch,
    parents: result.merged ? [parent, result.merged] : [parent],
    message: `${title}${result.merged ? "\n\nMerges main." : ""}\n\nAsked by ${requester} in #${channel}: ${threadUrl}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`,
    files: changes,
  });

  // After a merge the pushed files include main's changes, so list what the PR itself changes.
  const files = result.merged
    ? await compareWithMain(token, branch).then(
        (c) => c.files,
        () => result.files.map((f) => f.path),
      )
    : result.files.map((f) => f.path);
  const touchesConvex = files.some((f) => f.startsWith("convex/"));
  const quoted = request.replace(/\n/g, "\n> ");
  let prNumber = run.prNumber;
  let prUrl = prNumber ? `https://github.com/${REPO}/pull/${prNumber}` : "";
  const note = unfinished
    ? `\n\n**${UNFINISHED}** The agent ran out of steps before finishing, so this won't merge on its own. Reply @Claude continue in the thread to keep going.`
    : "";
  if (prNumber) {
    await comment(
      token,
      prNumber,
      `Follow-up from ${requester} ([thread](${threadUrl})):\n\n> ${quoted}\n\n${summary}${details ? `\n\n${details}` : ""}${note}`,
    );
    await retitle(token, prNumber, !!unfinished);
  } else {
    await report({ step: "Opening a pull request" });
    const pr = await createPr(token, {
      branch,
      title: unfinished ? `${UNFINISHED} ${title}` : title,
      body: `Asked by ${requester} in #${channel} ([thread](${threadUrl})):\n\n> ${quoted}\n\n${summary}${details ? `\n\n${details}` : ""}\n\nChecks (run in the sandbox): ${checksPassed ? "typecheck and lint pass" : "**typecheck or lint failed**"}.${touchesConvex ? "\n\nChanges `convex/`: the production build deploys it on merge." : ""}\n\nOpened by @Claude from Just Write chat.${note}`,
    });
    prNumber = pr.number;
    prUrl = pr.html_url;
  }

  const verdict = unfinished
    ? { merge: false, why: "unfinished: the agent ran out of steps" }
    : await decide(token, branch, request, checksPassed);
  const common = {
    title,
    summary,
    files,
    checksPassed,
    touchesConvex,
    prNumber,
    prUrl,
    verdict: `${verdict.merge ? "merge" : "review"}: ${verdict.why}`,
  };
  if (verdict.merge) {
    await report({ step: "Merging" });
    await mergePr(token, prNumber, branch);
    await report({ patch: { ...common, status: "merged" } });
  } else {
    await report({
      patch: { ...common, status: "pr", previewUrl: previewUrlFor(branch) },
    });
  }
}

// Keeps "(unfinished)" at the front of a PR's title only while its latest run is unfinished.
async function retitle(token: string, prNumber: number, unfinished: boolean) {
  const pr = await getPr(token, prNumber);
  const marked = pr.title.startsWith(`${UNFINISHED} `);
  if (marked === unfinished) return;
  await updatePr(token, prNumber, {
    title: unfinished
      ? `${UNFINISHED} ${pr.title}`
      : pr.title.slice(UNFINISHED.length + 1),
  });
}

// The changed files' contents, read straight from the sandbox's clone.
async function readChanges(
  sandboxId: string | null,
  files: Extract<RunnerResult, { outcome: "changes" }>["files"],
): Promise<FileChange[]> {
  if (!sandboxId) throw new Error("The run has no sandbox.");
  const sandbox = await withTimeLimit("get", LOOKUP_MS, (signal) =>
    Sandbox.get({ name: sandboxId, signal }),
  );
  const out: FileChange[] = [];
  for (const f of files) {
    if (f.mode === null) {
      out.push({ path: f.path, deleted: true });
      continue;
    }
    const content = await withTimeLimit("readFile", READ_MS, (signal) =>
      sandbox.readFileToBuffer(
        { path: `${SANDBOX_ROOT}/${f.path}` },
        { signal },
      ),
    );
    if (!content) throw new Error(`Couldn’t read ${f.path} from the sandbox.`);
    if (content.length > MAX_FILE_BYTES)
      throw new Error(`${f.path} is too big to push.`);
    out.push({ path: f.path, mode: f.mode, content });
  }
  return out;
}

// Whether the whole PR (every commit on the branch, not just this run's) can merge without
// an admin. Looks at the branch on GitHub, so it covers exactly what would go live.
async function decide(
  token: string,
  branch: string,
  request: string,
  checksPassed: boolean,
): Promise<{ merge: boolean; why: string }> {
  if (!checksPassed) return { merge: false, why: "typecheck or lint failed" };
  if (MERGE_POLICY === "review")
    return { merge: false, why: "every change gets reviewed for now" };
  const pr = await compareWithMain(token, branch).catch((err) => {
    console.error("improve: compare failed", branch, err);
    return null;
  });
  if (!pr)
    return { merge: false, why: "couldn’t compare the branch with main" };
  if (pr.files.length >= MAX_FILES)
    return { merge: false, why: "it changes too many files" };
  if (!CONVEX_AUTODEPLOY && pr.files.some((f) => f.startsWith("convex/")))
    return { merge: false, why: "it changes the backend" };
  const sensitive = pr.files.filter((f) =>
    SENSITIVE_PATHS.some((re) => re.test(f)),
  );
  if (sensitive.length)
    return {
      merge: false,
      why: `it touches ${sensitive.slice(0, 3).join(", ")}`,
    };
  if (MERGE_POLICY === "automerge")
    return { merge: true, why: "checks passed" };
  return await classify(request, pr.diff);
}

async function classify(
  request: string,
  diff: string,
): Promise<{ merge: boolean; why: string }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
              '"auto" only if the change is small and clearly safe: UI, copy, styling, or self-contained features with no risk of losing or exposing data, no new dependencies, and no changes to auth, payments, terms, email, schema, permissions, or environment. Anything else, or anything you are unsure about, is "review".',
          },
          {
            role: "user",
            content: `Request: ${request}\n\nDiff:\n${diff.slice(0, 60_000)}`,
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
