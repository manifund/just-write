// Renders the same subjects in several styles across several image models, for picking
// a house style.
//
//   bun scripts/art/compare.ts --list                       # image models on OpenRouter
//   bun scripts/art/compare.ts --models a,b,c [--styles engraving,sumi,photo] [--ids x,y]
//
// Subjects come from content/zine/art-prompts.json (the first 3 unless --ids). Writes
// originals to art-inbox/compare/ and grayscale 3:2 webps to public/zine/art/compare/,
// listed in content/zine/art-compare.json. Models run in parallel, images within a
// model one at a time.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { imageModels, render } from "./openrouter";
import { ASPECT, type ArtPrompt, STYLES, stylePrompt } from "./style";

const OUT = "public/zine/art/compare";
const RAW = "art-inbox/compare";
const WIDTH = 1000;

const { values: args } = parseArgs({
  options: {
    list: { type: "boolean", default: false },
    models: { type: "string" },
    styles: { type: "string", default: "engraving,sumi,photo" },
    ids: { type: "string" },
  },
});

if (args.list || !args.models) {
  for (const m of await imageModels())
    console.log(
      `${new Date(m.created * 1000).toISOString().slice(0, 10)}  ${m.id}  (${m.name})`,
    );
  if (!args.models) console.log("\nPass --models a,b,c to render.");
  process.exit(0);
}

const models = args.models.split(",");
const styles = args.styles.split(",");
for (const s of styles)
  if (!(s in STYLES))
    throw new Error(`Unknown style ${s}; have ${Object.keys(STYLES)}`);
const drafts: ArtPrompt[] = JSON.parse(
  readFileSync("content/zine/art-prompts.json", "utf8"),
);
const subjects = args.ids
  ? drafts.filter((d) => args.ids!.split(",").includes(d.id))
  : drafts.slice(0, 3);

type Result = {
  style: string;
  model: string;
  id: string;
  title: string;
  file: string | null;
  secs: number | null;
  cost: number | null;
  error: string | null;
};

const slug = (model: string) => model.replace(/[^a-z0-9.-]+/gi, "_");
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

async function runModel(model: string): Promise<Result[]> {
  const results: Result[] = [];
  for (const style of styles)
    for (const d of subjects) {
      const name = `${style}__${slug(model)}__${d.id}`;
      const base = { style, model, id: d.id, title: d.title };
      try {
        const { png, secs, cost } = await render(
          model,
          stylePrompt(style, d.subject),
          { aspect: ASPECT },
        );
        writeFileSync(`${RAW}/${name}.png`, png);
        // Grayscale (some models sneak in a tint), center-crop to 3:2.
        const { width = 0, height = 0 } = await sharp(png).metadata();
        const w = Math.min(width, Math.round((height * 3) / 2));
        const h = Math.round((w * 2) / 3);
        await sharp(png)
          .extract({
            left: Math.floor((width - w) / 2),
            top: Math.floor((height - h) / 2),
            width: w,
            height: h,
          })
          .grayscale()
          .resize({ width: Math.min(WIDTH, w) })
          .webp({ quality: 82 })
          .toFile(`${OUT}/${name}.webp`);
        console.log(`✓ ${name} ${secs}s $${cost?.toFixed(3) ?? "?"}`);
        results.push({
          ...base,
          file: `/zine/art/compare/${name}.webp`,
          secs,
          cost,
          error: null,
        });
      } catch (e) {
        const error = (e as Error).message;
        console.error(`! ${name}: ${error}`);
        results.push({ ...base, file: null, secs: null, cost: null, error });
      }
    }
  return results;
}

const results = (await Promise.all(models.map(runModel))).flat();
writeFileSync(
  "content/zine/art-compare.json",
  JSON.stringify({ models, styles, styleText: STYLES, results }, null, 2) +
    "\n",
);
const cost = results.reduce((sum, r) => sum + (r.cost ?? 0), 0);
console.log(
  `${results.filter((r) => r.file).length}/${results.length} images, $${cost.toFixed(2)}`,
);
