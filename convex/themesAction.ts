"use node";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  buildCloud,
  essayText,
  notionText,
  readPage,
  TEXT_MAX,
} from "./lib/essayText";

const MODEL = "anthropic/claude-sonnet-5.5";
// Characters of essay text sent to the model in all, split evenly across essays.
const PROMPT_CHARS = 300_000;
const PER_ESSAY_CHARS = 8_000;
// For "Read together", each theme's essays are read again much more fully, in their own call.
const PAIR_PROMPT_CHARS = 300_000;

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
        themes = {
          overview: undefined,
          themes: [],
          summaries: [],
          quotes: [],
        };
      } else {
        try {
          themes = await findThemes(essays);
          themes = { ...themes, themes: await withPairs(themes.themes, essays) };
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
  // Notion pages are built by scripts too; their blocks come from Notion's page API.
  const notion = await notionText(url).catch(() => null);
  if (notion) return notion.slice(0, TEXT_MAX);
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
    const body = await readPage(res);
    if (!body) return null;
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
  authorId: Id<"members">;
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
              pairs: z
                .array(
                  z.object({
                    essays: z
                      .array(z.string())
                      .describe(
                        "Ids of exactly two essays in this theme, by different writers",
                      ),
                    kind: z.enum(["contrast", "complement"]),
                    why: z
                      .string()
                      .describe(
                        "One plain sentence, under 30 words, on how the two essays disagree or fill each other in",
                      ),
                  }),
                )
                .max(2)
                .describe(
                  "Two pairs of this theme's essays worth reading together, four different essays in all; fewer if the theme is too small",
                ),
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
        quotes: z
          .array(
            z.object({
              essay: z.string().describe("The essay's id, e.g. “e3”"),
              quote: z
                .string()
                .describe(
                  "One or two consecutive sentences copied exactly from the essay's text, 10 to 50 words",
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
      "For each theme, also pick two pairs of its essays that are especially good to read together, four different essays in all, each pair by two different writers. A pair either contrasts (the essays take different sides or reach different conclusions on a shared question) or complements (one fills in what the other leaves out). Say which, and why, in one sentence that says what each essay argues. Give fewer pairs when the theme doesn't have four essays that fit. " +
      "Also write one plain sentence on what each essay with text is about, shown on its card in the club chat. " +
      "Also pick a quote from each essay with text: one or two sentences in a row, copied character for character, that show what the essay says and read well on their own (not a heading, caption, or subscribe prompt). " +
      "Write in a neutral, simple style: no praise for the essays or writers, no flowery words. Never invent anything that isn't in the text. " +
      "Some essays are cut off partway; a few may only have a title.",
    prompt: `${essays.length} essays:\n\n${prompt}`,
  });

  const byKey = new Map(essays.map((e, i) => [`e${i + 1}`, e.id]));
  const authorOf = new Map(essays.map((e) => [e.id, e.authorId]));
  return {
    overview: output?.overview.trim().slice(0, 600) || undefined,
    themes: (output?.themes ?? [])
      .map((t) => {
        const essayIds = [
          ...new Set(t.essays.flatMap((k) => byKey.get(k.trim()) ?? [])),
        ];
        return {
          name: t.name.trim().slice(0, 60),
          summary: t.summary.trim().slice(0, 300),
          essayIds,
          pairs: pairsIn(t.pairs ?? [], essayIds, byKey, authorOf),
        };
      })
      .filter((t) => t.name && t.essayIds.length > 0)
      .slice(0, 8),
    summaries: (output?.summaries ?? []).flatMap((s) => {
      const essayId = byKey.get(s.essay.trim());
      const summary = s.summary.trim().slice(0, 300);
      return essayId && summary ? [{ essayId, summary }] : [];
    }),
    quotes: (output?.quotes ?? []).flatMap((q) => {
      const essay = essays.find((e) => e.id === byKey.get(q.essay.trim()));
      const quote = essay?.text && exactQuote(q.quote, essay.text);
      return essay && quote ? [{ essayId: essay.id, quote }] : [];
    }),
  };
}

type Pair = { essays: string[]; kind: "contrast" | "complement"; why: string };

// Keeps pairs of two essays from the theme by different writers, each essay used once.
function pairsIn(
  pairs: Pair[],
  inTheme: Id<"essays">[],
  byKey: Map<string, Id<"essays">>,
  authorOf: Map<Id<"essays">, Id<"members">>,
) {
  const used = new Set<Id<"essays">>();
  return pairs
    .flatMap((p) => {
      const ids = [
        ...new Set(p.essays.flatMap((k) => byKey.get(k.trim()) ?? [])),
      ];
      const why = p.why.trim().slice(0, 300);
      if (
        ids.length !== 2 ||
        !why ||
        ids.some((id) => !inTheme.includes(id) || used.has(id)) ||
        authorOf.get(ids[0]) === authorOf.get(ids[1])
      )
        return [];
      ids.forEach((id) => used.add(id));
      return [{ essayIds: ids, kind: p.kind, why }];
    })
    .slice(0, 2);
}

type Theme = Awaited<ReturnType<typeof findThemes>>["themes"][number];

// Picks each theme's "Read together" pairs in a call of its own that reads the theme's
// essays far more fully than the themes call can. A theme whose call fails keeps the
// pairs from the themes call.
async function withPairs(themes: Theme[], essays: Essay[]): Promise<Theme[]> {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  return Promise.all(
    themes.map(async (theme) => {
      const inTheme = theme.essayIds.flatMap(
        (id) => essays.find((e) => e.id === id && e.text) ?? [],
      );
      if (new Set(inTheme.map((e) => e.authorId)).size < 2) return theme;
      const per = Math.min(
        TEXT_MAX,
        Math.floor(PAIR_PROMPT_CHARS / inTheme.length),
      );
      const byKey = new Map(inTheme.map((e, i) => [`e${i + 1}`, e.id]));
      const authorOf = new Map(inTheme.map((e) => [e.id, e.authorId]));
      try {
        const { output } = await generateText({
          model: openrouter(MODEL),
          abortSignal: AbortSignal.timeout(3 * 60_000),
          output: Output.object({
            schema: z.object({
              notes: z
                .array(
                  z.object({
                    essay: z.string().describe("The essay's id, e.g. “e3”"),
                    argument: z
                      .string()
                      .describe(
                        "Two or three plain sentences: the essay's central claim, how it argues for it, and what it concludes or leaves open",
                      ),
                  }),
                )
                .describe("One for every essay, written before picking pairs"),
              pairs: z
                .array(
                  z.object({
                    essays: z
                      .array(z.string())
                      .describe(
                        "Ids of exactly two essays, by different writers",
                      ),
                    kind: z.enum(["contrast", "complement"]),
                    why: z
                      .string()
                      .describe(
                        "One plain sentence, under 30 words, naming the specific claim or idea in each essay that makes them disagree or fill each other in",
                      ),
                  }),
                )
                .max(2),
            }),
          }),
          system:
            "You read the essays in one theme of a small online writing club's essays, to pick pairs that are especially good to read together. " +
            "Read every essay in full before choosing. First write notes on each essay's actual argument: what it claims, how it gets there, and where it ends up, not just its topic. " +
            "Then pick two pairs, four different essays in all, each pair by two different writers. " +
            "A pair contrasts when the essays take different sides, reach different conclusions, or answer the same question in opposing ways; it complements when one supplies what the other leaves out, such as evidence, a case, or a next step. " +
            "Pick pairs for what the essays argue, not for sharing a topic or keywords; skip a pairing whose link only shows up in the titles or opening paragraphs. Prefer fewer pairs to a weak one. " +
            "Write the reason in a neutral, simple style, naming the specific point in each essay. No praise, no flowery words, and never invent anything that isn't in the text. " +
            "Some essays are cut off partway.",
          prompt:
            `Theme: ${theme.name}. ${theme.summary}\n\n${inTheme.length} essays:\n\n` +
            inTheme
              .map(
                (e, i) =>
                  `<essay id="e${i + 1}" title="${attr(e.title)}" author="${attr(e.author)}">\n${e.text!.slice(0, per)}\n</essay>`,
              )
              .join("\n\n"),
        });
        if (!output) return theme;
        return {
          ...theme,
          pairs: pairsIn(output.pairs, theme.essayIds, byKey, authorOf),
        };
      } catch (err) {
        console.error(`Read together pairs failed for ${theme.name}`, err);
        return theme;
      }
    }),
  );
}

// Straight quotes, plain dashes, and single spaces, so typography doesn't break a match.
const loose = (s: string) =>
  s
    .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201f\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();

// The quote as the essay writes it, or null if the model's text isn't in the essay word
// for word. The text above may be cut off, so this checks the essay's whole saved text.
function exactQuote(quote: string, text: string): string | null {
  const q = loose(quote).replace(/^["']|["']$/g, "").trim();
  if (q.length < 20 || q.length > 400) return null;
  // Map each character of the loosened text back to where it starts in the original.
  let flat = "";
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (!space && flat) {
        flat += " ";
        at.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    const l = loose(c) || c;
    for (const ch of l) {
      flat += ch;
      at.push(i);
    }
  }
  const start = flat.indexOf(q);
  if (start < 0) return null;
  const from = at[start];
  const to = at[start + q.length - 1] + 1;
  return text.slice(from, to).replace(/\s+/g, " ").trim();
}
