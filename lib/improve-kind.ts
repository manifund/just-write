// Decides whether an @Claude request that didn't say "!chat" or "!code" is a chat task (read
// the club's data to answer or post something, convex/chatTasks.ts) or a change to the site.
// Called by app/api/improve/route.ts right after it claims a code run whose request doesn't
// say (convex/server.ts#kindUnsaid), before anything else happens for it; a chat task answer
// makes it one (server.becomeChatTask). Anything that goes wrong here leaves it a code run,
// as it would have been before this check existed.
import { CLASSIFIER_MODEL } from "@/convex/lib/improve";

export type Kind = { kind: "chat" | "code"; why: string };

export async function pickKind(brief: {
  request: string;
  thread: { author: string; text: string }[];
}): Promise<Kind> {
  const code = (why: string): Kind => ({ kind: "code", why });
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return code("no classifier key");
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
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
              "A member of a small online writing club mentioned an AI agent in the club's chat. The agent can handle a request in one of two ways, and you decide which this one needs.",
              "code: change the club's website (pages, features, fixes, design, wording) and open a pull request, or answer a question about how the site works or is built, from its code.",
              "chat: read the club's current data (chat messages, members and their profiles, essays, the calendar and RSVPs, ideas) to answer a question about the club or its members, or write one message to post in a channel, like a recap, a list, some numbers, or an announcement. A chat task can't change the site.",
              'A follow-up usually needs the same as the earlier requests in the thread it refers to ("make it shorter", "try again", "also add a button"). If it could be either, or asks for both, answer code.',
              'Answer with JSON {"kind": "code" | "chat", "reason": "<under 12 words>"}.',
            ].join("\n\n"),
          },
          {
            role: "user",
            content: [
              brief.thread.length > 1
                ? `Thread so far:\n${brief.thread
                    .map((m) => `${m.author}: ${m.text}`)
                    .join("\n\n")
                    .slice(-12_000)}`
                : "",
              `New request:\n${brief.request}`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      }),
    });
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content) as {
      kind?: unknown;
      reason?: unknown;
    };
    const why = String(out.reason ?? "").slice(0, 120);
    return out.kind === "chat" ? { kind: "chat", why } : code(why);
  } catch (err) {
    console.error("improve: picking the kind failed", err);
    return code("the classifier didn’t answer");
  }
}
