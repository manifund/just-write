"use node";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { buildCloud, essayText, TEXT_MAX } from "./lib/essayText";

const MODEL = "anthropic/claude-sonnet-5.5";
// Characters of essay text sent to the model in all, split evenly across essays.
const PROMPT_CHARS = 300_000;
const PER_ESSAY_CHARS = 8_000;

// Reads essays that haven't been read yet, then rebuilds the word cloud and, when the set
// of essays changed, asks Claude for themes. Scheduled by themes.request.
export const compute = internalAction({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.runQuery(internal.themes.toFetch, {});
    for (let i = 0; i < pending.length; i += 4) {
      await Promise.all(
        pending.slice(i, i + 4).map(async ({ essayId, url }) => {
          const text = await readEssay(url);
          await ctx.runMutation(internal.themes.saveText, {
            essayId,
            url,
            text: text ?? undefined,
          });
        }),
      );
    }

    const { hash, previousHash, orphans, essays } = await ctx.runQuery(
      internal.themes.inputs,
      {},
    );
    const withText = essays.flatMap((e) =>
      e.text ? [{ text: e.text, author: e.authorId as string }] : [],
    );
    let themes: Awaited<ReturnType<typeof findThemes>> | undefined;
    if (hash !== previousHash) {
      if (essays.length === 0 || !process.env.OPENROUTER_API_KEY) {
        if (!process.env.OPENROUTER_API_KEY)
          console.warn("OPENROUTER_API_KEY is not set; skipping essay themes");
        themes = { overview: undefined, themes: [], summaries: [] };
      } else {
        try {
          themes = await findThemes(essays);
        } catch (err) {
          console.error("Essay themes failed", err);
        }
      }
    }
    await ctx.runMutation(internal.themes.save, {
      cloud: buildCloud(withText),
      read: withText.length,
      orphans,
      themes: themes && { ...themes, inputHash: hash },
    });
  },
});

const UA =
  "Mozilla/5.0 (compatible; JustWriteBot/1.0; +https://justwrite.club)";

// The essay's text, or null if the page couldn't be read.
async function readEssay(url: string) {
  // Public Google Docs have a plain-text export; their normal page is built by scripts.
  const doc = url.match(/^https:\/\/docs\.google\.com\/document\/d\/([\w-]+)/);
  const target = doc
    ? `https://docs.google.com/document/d/${doc[1]}/export?format=txt`
    : url;
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const body = (await res.text()).slice(0, 2_000_000);
    if (type.includes("html")) return essayText(body);
    if (type.startsWith("text/plain")) {
      const text = body.trim();
      return text.length > 500 ? text.slice(0, TEXT_MAX) : null;
    }
    return null;
  } catch {
    return null;
  }
}

type Essay = {
  id: Id<"essays">;
  title: string;
  author: string;
  text: string | null;
};

const attr = (s: string) => s.replace(/["<>\n]/g, " ");

// Claude reads the essays and sorts them into a handful of themes.
async function findThemes(essays: Essay[]) {
  const per = Math.min(
    PER_ESSAY_CHARS,
    Math.floor(PROMPT_CHARS / essays.length),
  );
  const prompt = essays
    .map(
      (e, i) =>
        `<essay id="e${i + 1}" title="${attr(e.title)}" author="${attr(e.author)}">\n` +
        `${e.text ? e.text.slice(0, per) : "(The page couldn't be read; only the title is known.)"}\n</essay>`,
    )
    .join("\n\n");
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  const { output } = await generateText({
    model: openrouter(MODEL),
    abortSignal: AbortSignal.timeout(5 * 60_000),
    output: Output.object({
      schema: z.object({
        overview: z
          .string()
          .describe(
            "Two plain sentences on what these essays are about as a whole",
          ),
        themes: z
          .array(
            z.object({
              name: z
                .string()
                .describe("2 to 4 plain words, e.g. “Raising kids”"),
              summary: z
                .string()
                .describe(
                  "One plain sentence, under 25 words, on what these essays share",
                ),
              essays: z
                .array(z.string())
                .describe("Ids of the essays in this theme, e.g. “e3”"),
            }),
          )
          .max(8),
        summaries: z
          .array(
            z.object({
              essay: z.string().describe("The essay's id, e.g. “e3”"),
              summary: z
                .string()
                .describe(
                  "One plain sentence, under 25 words, on what this essay is about, without its title or author",
                ),
            }),
          )
          .describe("One for every essay that has text"),
      }),
    }),
    system:
      "You read the essays published by members of a small online writing club (4 essays each in November) and sort them into themes, for a page that shows what the club is writing about. " +
      "Make 4 to 8 themes. Put each essay in the one or two themes it fits best, and every essay in at least one. " +
      "Name themes in plain words a member would use, not clever phrases. Describe what the essays actually say, specifically. " +
      "Also write one plain sentence on what each essay with text is about, shown on its card in the club chat. " +
      "Write in a neutral, simple style: no praise for the essays or writers, no flowery words. Never invent anything that isn't in the text. " +
      "Some essays are cut off partway; a few may only have a title.",
    prompt: `${essays.length} essays:\n\n${prompt}`,
  });

  const byKey = new Map(essays.map((e, i) => [`e${i + 1}`, e.id]));
  return {
    overview: output?.overview.trim().slice(0, 600) || undefined,
    themes: (output?.themes ?? [])
      .map((t) => ({
        name: t.name.trim().slice(0, 60),
        summary: t.summary.trim().slice(0, 300),
        essayIds: [
          ...new Set(t.essays.flatMap((k) => byKey.get(k.trim()) ?? [])),
        ],
      }))
      .filter((t) => t.name && t.essayIds.length > 0)
      .slice(0, 8),
    summaries: (output?.summaries ?? []).flatMap((s) => {
      const essayId = byKey.get(s.essay.trim());
      const summary = s.summary.trim().slice(0, 300);
      return essayId && summary ? [{ essayId, summary }] : [];
    }),
  };
}
