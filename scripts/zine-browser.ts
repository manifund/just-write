// Lays out a zine document in headless Chrome, for scripts/zine-pdf.ts and
// scripts/zine-pages.ts. Serves the document at / and public/ beside it, so image paths
// match the site's. Uses Chrome from CHROME_PATH, else the installed Google Chrome.
import { chromium, type Page } from "playwright-core";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// Opens the document, waits for Paged.js to finish, then hands the page to `onDone`.
export async function withLaidOut<T>(
  html: string,
  onDone: (page: Page, pages: number) => Promise<T>,
): Promise<T> {
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
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
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
    console.log(
      `laid out ${done.pages} pages in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    return await onDone(page, done.pages);
  } finally {
    await browser.close();
    server.close();
  }
}
