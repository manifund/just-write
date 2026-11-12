// Imports picked illustrations into the zine and the site.
//
//   bun scripts/art/import.ts            # every file in art-inbox/
//   bun scripts/art/import.ts --dir ~/Downloads/picks
//
// Name each file <essayId>.<png|jpg|webp> (or cover.png). Each is turned to grayscale,
// center-cropped to 3:2, saved as public/zine/art/<id>.png (print) and <id>.webp (site,
// 1200px), and recorded in content/zine/art.json with its prompt and alt text from
// content/zine/art-prompts.json.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { type ArtManifest, type ArtPrompt, imagePrompt } from "./style";

const MANIFEST = "content/zine/art.json";
const PROMPTS = "content/zine/art-prompts.json";
const OUT_DIR = "public/zine/art";
const MIN_WIDTH = 1800; // 6 in at 300 ppi
const WEB_WIDTH = 1200;

const { values: args } = parseArgs({
  options: { dir: { type: "string", default: "art-inbox" } },
});

const read = <T>(path: string, fallback: T): T =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
const manifest = read<ArtManifest>(MANIFEST, {});
const prompts = new Map(read<ArtPrompt[]>(PROMPTS, []).map((p) => [p.id, p]));
const modelFile = join(args.dir, "model.txt");
const model = existsSync(modelFile)
  ? readFileSync(modelFile, "utf8").trim()
  : null;

mkdirSync(OUT_DIR, { recursive: true });
const files = readdirSync(args.dir).filter((f) =>
  [".png", ".jpg", ".jpeg", ".webp"].includes(extname(f).toLowerCase()),
);
if (files.length === 0) console.log(`No images in ${args.dir}/`);

for (const f of files) {
  const id = basename(f, extname(f));
  const src = join(args.dir, f);
  const { width = 0, height = 0 } = await sharp(src).metadata();
  // Center-crop to 3:2.
  const w = Math.min(width, Math.round((height * 3) / 2));
  const h = Math.round((w * 2) / 3);
  if (w < MIN_WIDTH)
    console.warn(
      `! ${f}: ${w}px wide after crop, under ${MIN_WIDTH}px; regenerate at a larger size`,
    );
  const base = sharp(src)
    .extract({
      left: Math.floor((width - w) / 2),
      top: Math.floor((height - h) / 2),
      width: w,
      height: h,
    })
    .grayscale()
    .toColourspace("b-w");
  await base
    .clone()
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toFile(join(OUT_DIR, `${id}.png`));
  await base
    .clone()
    .resize({ width: Math.min(WEB_WIDTH, w) })
    .webp({ quality: 82 })
    .toFile(join(OUT_DIR, `${id}.webp`));

  const p = prompts.get(id);
  const prev = manifest[id];
  manifest[id] = {
    file: `/zine/art/${id}.png`,
    web: `/zine/art/${id}.webp`,
    prompt: p ? imagePrompt(p.subject, false) : (prev?.prompt ?? null),
    alt: prev?.alt ?? p?.alt ?? "",
    credit: prev?.credit ?? model ?? "AI-generated",
  };
  console.log(`✓ ${id}${p ? ` (${p.title})` : ""}: ${w}×${h}`);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Updated ${MANIFEST}`);
