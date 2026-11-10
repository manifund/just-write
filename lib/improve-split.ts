// Splits an @Claude request that asks for several separate changes at once ("in parallel:
// add X, fix Y") into one instruction per change. Called by app/api/improve/route.ts for
// code runs whose request matches PARALLEL; convex/server.ts#splitRun then gives every part
// after the first its own run. A request that's really one change comes back as one part,
// and so does anything that goes wrong here: the run just carries on as asked.
import { CLASSIFIER_MODEL, MAX_PARALLEL } from "@/convex/lib/improve";

export async function splitRequest(brief: {
  request: string;
  thread: { author: string; text: string }[];
}): Promise<string[]> {
  const one = [brief.request];
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return one;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "A member of a small website's community asked an AI agent, in a chat thread, to change the site. The agent can split one request into several runs that work at the same time, each making one change in its own pull request.",
              'Decide whether the new request asks for several separate changes to be done that way (in parallel, at the same time, as separate PRs or sessions). If it does, write one task per change. Each task is read on its own by an agent that also sees the thread, so make it self-contained: say exactly what to build, in the member\'s words where you can, and spell out anything it refers to ("suggestions 2 and 4 above" becomes what those suggestions were). Keep anything the request says about all of them (like "effort: high") in every task.',
              "Return a single task, the request unchanged, if it asks for one change, if it is about parallel work as a feature rather than asking for it now, or if the changes depend on each other or would edit the same code so heavily they'd conflict. Don't break one change into steps.",
              `At most ${MAX_PARALLEL} tasks. Answer with JSON {"tasks": ["<task>", ...]}.`,
            ].join("\n\n"),
          },
          {
            role: "user",
            content: [
              `Thread so far:\n${brief.thread
                .map((m) => `${m.author}: ${m.text}`)
                .join("\n\n")
                .slice(-20_000)}`,
              `New request:\n${brief.request}`,
            ].join("\n\n"),
          },
        ],
      }),
    });
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content) as {
      tasks?: unknown;
    };
    const tasks = Array.isArray(out.tasks)
      ? out.tasks
          .filter((t): t is string => typeof t === "string" && !!t.trim())
          .slice(0, MAX_PARALLEL)
      : [];
    return tasks.length > 1 ? tasks : one;
  } catch (err) {
    console.error("improve: splitting the request failed", err);
    return one;
  }
}
