// Imports picked illustrations into the zine and the site.
//
//   bun scripts/art/import.ts            # every file in art-inbox/
//   bun scripts/art/import.ts --dir ~/Downloads/picks
//
// Name each file <essayId>.<png|jpg|webp> (or cover.png). Each is turned to grayscale,
// trimmed of bare paper and padded to 3:2, saved as public/zine/art/<id>.png (print) and <id>.webp (site,
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
const MARGIN = 0.06; // white space on each side, as a share of the print

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
  // Trim the bare paper the model leaves around the print, then pad it back out with
  // white to 3:2 with an even margin, so every image sits the same way on the page.
  const trimmed = await sharp(src)
    .grayscale()
    .toColourspace("b-w")
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 40 })
    .toBuffer({ resolveWithObject: true });
  const { width: tw, height: th } = trimmed.info;
  const w = Math.max(
    Math.round(tw * (1 + 2 * MARGIN)),
    Math.round(th * (1 + 2 * MARGIN) * 1.5),
  );
  const h = Math.round((w * 2) / 3);
  if (w < MIN_WIDTH)
    console.warn(
      `! ${f}: ${w}px wide, under ${MIN_WIDTH}px; regenerate at a larger size`,
    );
  const left = Math.floor((w - tw) / 2);
  const top = Math.floor((h - th) / 2);
  const base = sharp(trimmed.data).extend({
    left,
    right: w - tw - left,
    top,
    bottom: h - th - top,
    background: "#ffffff",
  });
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
