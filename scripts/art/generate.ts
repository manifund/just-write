// Renders each subject in content/zine/art-prompts.json with Google's Nano Banana
// image model through OpenRouter.
//
//   bun scripts/art/generate.ts                 # every subject without an image yet
//   bun scripts/art/generate.ts --only <id>,<id> --variants 3 --force
//   bun scripts/art/generate.ts --model google/gemini-3-pro-image-preview
//
// Writes art-inbox/<id>.png (first variant) and art-inbox/alts/<id>-<n>.png (others).
// Swap in an alt by hand if you prefer it, then run scripts/art/import.ts.
// With no --model, uses the newest google/* model on OpenRouter that outputs images.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { imageModels, render } from "./openrouter";
import { ASPECT, type ArtPrompt, imagePrompt, styleRef } from "./style";

const INBOX = "art-inbox";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    only: { type: "string" },
    variants: { type: "string", default: "2" },
    force: { type: "boolean", default: false },
  },
});

async function latestNanoBanana(): Promise<string> {
  const google = (await imageModels()).filter((m) =>
    m.id.startsWith("google/"),
  );
  if (!google[0]) throw new Error("No Google image model found on OpenRouter");
  console.log(`Google image models: ${google.map((m) => m.id).join(", ")}`);
  return google[0].id;
}

const model = args.model ?? (await latestNanoBanana());
console.log(`Using ${model}`);

const ref = styleRef();
const refUrl = ref
  ? `data:image/${extname(ref).slice(1)};base64,${readFileSync(ref).toString("base64")}`
  : null;
if (ref) console.log(`Style reference: ${ref}`);

async function renderOne(prompt: string): Promise<Buffer> {
  const { png, secs, cost } = await render(model, prompt, {
    aspect: ASPECT,
    refUrl,
  });
  console.log(`  ${secs}s${cost == null ? "" : `, $${cost.toFixed(3)}`}`);
  return png;
}

const drafts: ArtPrompt[] = JSON.parse(
  readFileSync("content/zine/art-prompts.json", "utf8"),
);
const only = args.only ? new Set(args.only.split(",")) : null;
mkdirSync(`${INBOX}/alts`, { recursive: true });

let failed = 0;
for (const d of drafts) {
  if (only && !only.has(d.id)) continue;
  if (!args.force && existsSync(`${INBOX}/${d.id}.png`)) continue;
  const prompt = imagePrompt(d.subject, !!refUrl);
  console.log(`- ${d.title}`);
  for (let n = 1; n <= Number(args.variants); n++) {
    try {
      const png = await renderOne(prompt);
      const path =
        n === 1 ? `${INBOX}/${d.id}.png` : `${INBOX}/alts/${d.id}-${n}.png`;
      writeFileSync(path, png);
      console.log(`  ${path}`);
    } catch (e) {
      failed++;
      console.error(`  ! ${d.id} variant ${n}: ${(e as Error).message}`);
    }
  }
}
// import.ts records this alongside each image.
writeFileSync(`${INBOX}/model.txt`, model);
if (failed) process.exitCode = 1;
