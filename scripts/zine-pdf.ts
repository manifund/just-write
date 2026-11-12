// Prints the magazine to PDF with headless Chrome, from the same document /zine previews.
//
//   bun scripts/zine-pdf.ts                         # week 1, default design
//   bun scripts/zine-pdf.ts --week 1 --tweaks '{"trim":"7x10","bodyFont":"garamond"}'
//   bun scripts/zine-pdf.ts --tweaks-file tweaks.json --out out/zine/test.pdf
//
// /zine's "Copy PDF command" button gives the --tweaks for what's on screen. The PDF is
// single pages at trim size (plus 0.125in bleed unless turned off), fonts embedded, no
// crop marks, as the printers in reports/ ask for. Chrome as in scripts/zine-browser.ts.
import { mkdir, readFile } from "node:fs/promises";
import { zineDocument } from "../lib/zine/document";
import { readTweaks } from "../lib/zine/tweaks";
import type { ZineArt, ZineIssue } from "../lib/zine/types";
import { withLaidOut } from "./zine-browser";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const week = Number(flag("--week") ?? 1);
const tweaksJson =
  flag("--tweaks") ??
  (flag("--tweaks-file") ? await readFile(flag("--tweaks-file")!, "utf8") : "{}");
const tweaks = readTweaks(JSON.parse(tweaksJson));
const out = flag("--out") ?? `out/zine/week-${week}.pdf`;

const issue = JSON.parse(
  await readFile(flag("--issue") ?? `content/zine/week-${week}.json`, "utf8"),
) as ZineIssue;
const art = JSON.parse(
  await readFile("content/zine/art.json", "utf8").catch(() => "{}"),
) as ZineArt;
const html = zineDocument(issue, art, tweaks);

await withLaidOut(html, async (page, pages) => {
  await mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  console.log(`wrote ${out}`);
  if (pages % 4)
    console.log(
      `note: ${pages} pages isn't a multiple of 4; printers add blank pages to reach one.`,
    );
});
