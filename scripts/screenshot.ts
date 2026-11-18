// Screenshots a page in headless Chromium, so @Claude can look at what it builds.
//   bun scripts/screenshot.ts <url or .html file> [out.png] [--width 1280] [--height 800]
//     [--full] [--dark] [--wait 1000]
// In the @Claude sandbox the runner installs the browser in the background
// (scripts/improve-runner/browser.ts); this waits for that to finish first. Elsewhere it
// uses Playwright's own download (`bunx playwright-core install chromium-headless-shell`),
// or CHROME_PATH.
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BROWSER_DONE = "/tmp/chromium.done";
const BROWSER_LOG = "/tmp/chromium-install.log";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const has = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const width = Number(flag("width") ?? 1280);
const height = Number(flag("height") ?? 800);
const wait = Number(flag("wait") ?? 500);
const full = has("full");
const dark = has("dark");
const [target, out = "/tmp/screenshot.png"] = args;
if (!target) {
  console.error(
    "usage: bun scripts/screenshot.ts <url or .html file> [out.png] [--width 1280] [--height 800] [--full] [--dark] [--wait 500]",
  );
  process.exit(1);
}
const url = /^https?:\/\//.test(target)
  ? target
  : pathToFileURL(resolve(target)).toString();

// The sandbox's install runs alongside the agent; give it a few minutes.
if (existsSync(BROWSER_LOG)) {
  const until = Date.now() + 5 * 60_000;
  while (!existsSync(BROWSER_DONE) && Date.now() < until) {
    console.log("waiting for Chromium to finish installing…");
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!existsSync(BROWSER_DONE) || readFileSync(BROWSER_DONE, "utf8").trim() !== "ok") {
    console.error(`Chromium didn't install; see ${BROWSER_LOG}`);
    process.exit(1);
  }
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
try {
  const page = await browser.newPage({
    viewport: { width, height },
    colorScheme: dark ? "dark" : "light",
  });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("console error:", m.text());
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out, fullPage: full });
  console.log(`saved ${out} (${width}×${height}${full ? ", full page" : ""})`);
} finally {
  await browser.close();
}
