// Prints the magazine to PDF with headless Chrome, from the same document /zine previews.
//
//   bun scripts/zine-pdf.ts                         # week 1, default design
//   bun scripts/zine-pdf.ts --week 1 --tweaks '{"trim":"7x10","bodyFont":"garamond"}'
//   bun scripts/zine-pdf.ts --tweaks-file tweaks.json --out out/zine/test.pdf
//
// /zine's "Copy PDF command" button gives the --tweaks for what's on screen. The PDF is
// single pages at trim size (plus 0.125in bleed unless turned off), fonts embedded, no
// crop marks, as the printers in reports/ ask for. Uses Chrome from CHROME_PATH, else the
// installed Google Chrome.
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { zineDocument } from "../lib/zine/document";
import { readTweaks } from "../lib/zine/tweaks";
import type { ZineArt, ZineIssue } from "../lib/zine/types";

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

const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Serves the document at / and public/ beside it, so image paths match the site's.
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }
  const file = normalize(join("public", path));
  if (!file.startsWith("public")) return res.writeHead(404).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;

const browser = await chromium.launch(
  process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" },
);
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  const started = Date.now();
  await page.waitForFunction(
    () => (window as unknown as { __zine?: { done?: unknown } }).__zine?.done,
    null,
    { timeout: 10 * 60_000, polling: 500 },
  );
  const done = await page.evaluate(
    () => (window as unknown as { __zine: { done: { pages: number } } }).__zine.done,
  );
  console.log(`laid out ${done.pages} pages in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  console.log(`wrote ${out}`);
  if (done.pages % 4)
    console.log(
      `note: ${done.pages} pages isn't a multiple of 4; printers add blank pages to reach one.`,
    );
} finally {
  await browser.close();
  server.close();
}
