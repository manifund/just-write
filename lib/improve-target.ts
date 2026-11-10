// Decides whether an @Claude request continues one of its thread's open PRs or starts a new
// one. Called by app/api/improve/route.ts before the sandbox starts, since the sandbox
// (and the agent session saved in it) belongs to a branch.
//
// Order: an explicit "new PR" or "#40" in the request wins; then, if the run just before
// this one failed partway (out of steps, timed out), pick that up; otherwise a quick model
// call reads the thread; if that fails, continue the PR of the run just before this one.
import { CLASSIFIER_MODEL } from "@/convex/lib/improve";

export type OpenPr = {
  id: string;
  run: number; // improvement number
  prNumber: number;
  title: string;
  request: string;
};

// The thread's latest run, when it failed after its sandbox started (convex/server.ts).
export type FailedRun = Omit<OpenPr, "prNumber"> & { prNumber: number | null };

// The earlier run this continues (an open PR or a failed run), or null for a new PR.
export type Target = { pr: OpenPr | FailedRun | null; why: string };

const NEW_PR =
  /\b(new|separate|fresh|another|different)\s+(pr|pull request|branch)\b/i;

export async function pickTarget(brief: {
  request: string;
  thread: { author: string; text: string }[];
  openPrs: OpenPr[];
  latestOpenPr: number | null;
  failedRun: FailedRun | null;
}): Promise<Target> {
  const { request, openPrs, failedRun } = brief;
  if (openPrs.length === 0 && !failedRun)
    return { pr: null, why: "no open PRs in this thread" };
  if (NEW_PR.test(request)) return { pr: null, why: "asked for a new PR" };

  // "#40", "PR 40", "run 78": a PR number or a run number of an open PR or the failed run.
  // The failed run comes first: it may be a follow-up on one of the open PRs, with newer work.
  const named = failedRun ? [failedRun, ...openPrs] : openPrs;
  for (const m of request.matchAll(/(?:#|\b(?:pr|pull request|run)\s*#?)(\d+)\b/gi)) {
    const n = Number(m[1]);
    const pr = named.find((p) => p.prNumber === n || p.run === n);
    if (pr) return { pr, why: "named in the request" };
  }

  // The last run stopped partway; a reply in the thread is almost always "keep going".
  if (failedRun) return { pr: failedRun, why: "the last run stopped before finishing" };

  const fallback = (why: string): Target => ({
    pr: openPrs.find((p) => p.prNumber === brief.latestOpenPr) ?? null,
    why,
  });
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return fallback("no classifier key");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "A member of a small website's community asked an AI agent, in a chat thread, to change the site. Earlier requests in the thread left pull requests open. Decide whether the new request is more work on one of those PRs (fixing, adjusting, retrying, updating, or extending that change) or a separate change that should get its own PR. If it refers back to earlier work in the thread (\"try again\", \"go ahead\", \"also make it blue\"), continue that PR. If it is about something unrelated, start a new one. " +
              'Answer with JSON {"continue": <PR number or null>, "reason": "<under 12 words>"}.',
          },
          {
            role: "user",
            content: [
              `Thread so far:\n${brief.thread
                .map((m) => `${m.author}: ${m.text}`)
                .join("\n\n")
                .slice(-20_000)}`,
              `Open PRs:\n${openPrs
                .map((p) => `PR #${p.prNumber} (run #${p.run}): ${p.title}\n  asked: ${p.request}`)
                .join("\n")}`,
              `New request:\n${request}`,
            ].join("\n\n"),
          },
        ],
      }),
    });
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content) as {
      continue?: unknown;
      reason?: unknown;
    };
    const why = String(out.reason ?? "").slice(0, 120);
    if (out.continue === null || out.continue === undefined) return { pr: null, why };
    const pr = openPrs.find((p) => p.prNumber === Number(out.continue));
    return pr ? { pr, why } : fallback("the classifier named an unknown PR");
  } catch (err) {
    console.error("improve: picking a PR failed", err);
    return fallback("the classifier didn’t answer");
  }
}
