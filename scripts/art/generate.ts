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
import { ASPECT, type ArtPrompt, imagePrompt, styleRef } from "./style";

const API = "https://openrouter.ai/api/v1";
const INBOX = "art-inbox";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    only: { type: "string" },
    variants: { type: "string", default: "2" },
    force: { type: "boolean", default: false },
  },
});

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("OPENROUTER_API_KEY is not set");
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

type Model = {
  id: string;
  created: number;
  architecture?: { output_modalities?: string[] };
};

async function latestNanoBanana(): Promise<string> {
  const res = await fetch(`${API}/models`, { headers });
  const { data } = (await res.json()) as { data: Model[] };
  const image = data
    .filter(
      (m) =>
        m.id.startsWith("google/") &&
        m.architecture?.output_modalities?.includes("image"),
    )
    .sort((a, b) => b.created - a.created);
  if (!image[0]) throw new Error("No Google image model found on OpenRouter");
  console.log(`Google image models: ${image.map((m) => m.id).join(", ")}`);
  return image[0].id;
}

const model = args.model ?? (await latestNanoBanana());
console.log(`Using ${model}`);

const ref = styleRef();
const refUrl = ref
  ? `data:image/${extname(ref).slice(1)};base64,${readFileSync(ref).toString("base64")}`
  : null;
if (ref) console.log(`Style reference: ${ref}`);

async function render(prompt: string): Promise<Buffer> {
  const content = refUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: refUrl } },
      ]
    : prompt;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        image_config: { aspect_ratio: ASPECT, image_size: "2K" },
        messages: [{ role: "user", content }],
      }),
    });
    const body = (await res.json()) as {
      error?: { message: string };
      choices?: { message: { images?: { image_url: { url: string } }[] } }[];
    };
    const url = body.choices?.[0]?.message.images?.[0]?.image_url.url;
    if (url) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    const why = body.error?.message ?? `no image (HTTP ${res.status})`;
    if (attempt >= 3) throw new Error(why);
    console.warn(`  retrying: ${why}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
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
      const png = await render(prompt);
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
