// Drafts one image subject per essay for the week's illustrations.
//
//   bun scripts/art/prompts.ts                      # Austin's essays + 6 random others
//   bun scripts/art/prompts.ts --week 1 --others 6 --seed 1 --author austin
//
// Reads content/zine/week-<n>.json (scripts/zine-cache.ts) and writes
// content/zine/art-prompts.json. Needs OPENROUTER_API_KEY. Edit subjects by hand, then
// run scripts/art/generate.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { type ArtPrompt, STYLE } from "./style";

// The fields this script reads from the cache (the full type is lib/zine/types.ts).
type ZineEssay = {
  id: string;
  title: string;
  author: { name: string; handle: string | null };
  html: string;
  error: string | null;
};
type ZineIssue = { essays: ZineEssay[] };

const MODEL = "anthropic/claude-opus-5.5";
const OUT = "content/zine/art-prompts.json";
const EXCERPT_CHARS = 12_000;

const { values: args } = parseArgs({
  options: {
    week: { type: "string", default: "1" },
    others: { type: "string", default: "6" },
    seed: { type: "string", default: "1" },
    author: { type: "string", default: "austin" },
  },
});

const issue: ZineIssue = JSON.parse(
  readFileSync(`content/zine/week-${args.week}.json`, "utf8"),
);
const readable = issue.essays.filter((e) => !e.error && e.html);

// Seeded shuffle (mulberry32), so the same seed picks the same essays.
function shuffle<T>(xs: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const who = args.author.toLowerCase();
// Matches the member's handle (or their full name), so "austin" doesn't pick up Austin Long.
const isAuthor = (e: ZineEssay) =>
  e.author.handle?.toLowerCase() === who || e.author.name.toLowerCase() === who;
const mine = readable.filter(isAuthor);
const others = shuffle(
  readable.filter((e) => !isAuthor(e)).sort((a, b) => a.id.localeCompare(b.id)),
  Number(args.seed),
).slice(0, Number(args.others));
const picked = [...mine, ...others];
console.log(
  `Picked ${mine.length} by "${args.author}" + ${others.length} others of ${readable.length} readable essays`,
);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z#0-9]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_CHARS);

if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is not set");
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const drafts: ArtPrompt[] = [];
for (const e of picked) {
  const { output } = await generateText({
    model: openrouter(MODEL),
    output: Output.object({
      schema: z.object({
        subject: z
          .string()
          .describe(
            "The image's subject, 8–25 words, concrete nouns and setting only",
          ),
        alt: z
          .string()
          .describe("Alt text for the finished image, one sentence"),
      }),
    }),
    system:
      "You art-direct illustrations for a small literary magazine of personal essays. " +
      `Every image is rendered in one house style: ${STYLE}. ` +
      "For the essay given, choose ONE concrete object, scene, or still life that stands for its central idea, " +
      "the way a New Yorker spot illustration would: oblique, specific, quiet. " +
      "Avoid clichés for the topic (no robots or circuit brains for AI, no lightbulbs for ideas, no money for finance), " +
      "close-up faces, crowds, screens, text, logos, and anything that only works in color. " +
      "Describe only what is in the frame; don't restate the style.",
    prompt: `Title: ${e.title}\nAuthor: ${e.author.name}\n\n${text(e.html)}`,
  });
  if (!output) throw new Error(`No subject for ${e.title}`);
  drafts.push({
    id: e.id,
    title: e.title,
    author: e.author.name,
    subject: output.subject,
    alt: output.alt,
  });
  console.log(`- ${e.title}: ${output.subject}`);
}

writeFileSync(OUT, JSON.stringify(drafts, null, 2) + "\n");
console.log(`Wrote ${OUT}`);
