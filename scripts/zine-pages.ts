// Typesets each cached issue in the default design once, so /zine can open those pages
// for everyone without waiting for the browser to lay them out.
//
//   bun scripts/zine-pages.ts            # every week in content/zine
//   bun scripts/zine-pages.ts --week 1
//
// Run it after scripts/zine-cache.ts, and after changing lib/zine/document.ts or the
// default design. Writes the pages to public/zine/week-<n>/default-<hash>.html and lists
// them in content/zine/defaults.json. Each entry carries the hash of the document it was
// made from (lib/zine/cache.ts#renderKey); /zine only uses it when its own document has the
// same hash, so a stale file is ignored and the browser typesets as before.
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { renderKey } from "../lib/zine/cache";
import { zineDocument } from "../lib/zine/document";
import { DEFAULT_TWEAKS } from "../lib/zine/tweaks";
import type { ZineArt, ZineDefaults, ZineIssue } from "../lib/zine/types";
import { withLaidOut } from "./zine-browser";

const args = process.argv.slice(2);
const i = args.indexOf("--week");
const only = i >= 0 ? Number(args[i + 1]) : null;

const art = JSON.parse(
  await readFile("content/zine/art.json", "utf8").catch(() => "{}"),
) as ZineArt;
const listPath = "content/zine/defaults.json";
const list = JSON.parse(
  await readFile(listPath, "utf8").catch(() => "{}"),
) as ZineDefaults;

const weeks = (await readdir("content/zine"))
  .map((f) => /^week-(\d+)\.json$/.exec(f)?.[1])
  .filter((w): w is string => !!w)
  .map(Number)
  .filter((w) => only === null || w === only)
  .sort((a, b) => a - b);

for (const week of weeks) {
  const issue = JSON.parse(
    await readFile(`content/zine/week-${week}.json`, "utf8"),
  ) as ZineIssue;
  // Exactly what /zine builds for the default design, so the hashes match.
  const html = zineDocument(issue, art, DEFAULT_TWEAKS, { preview: true });
  const key = await renderKey(html);
  if (!key) throw new Error("no crypto.subtle");
  const { snapshot, pages } = await withLaidOut(html, async (page, pages) => ({
    pages,
    snapshot: await page.evaluate(() =>
      (window as unknown as { zineSnapshot: () => string }).zineSnapshot(),
    ),
  }));
  const dir = `public/zine/week-${week}`;
  for (const f of await readdir(dir))
    if (/^default-[0-9a-f]+\.html$/.test(f)) await unlink(`${dir}/${f}`);
  const name = `default-${key.slice(0, 16)}.html`;
  await writeFile(`${dir}/${name}`, snapshot);
  list[week] = { key, pages, src: `/zine/week-${week}/${name}` };
  console.log(`week ${week}: wrote ${dir}/${name}`);
}

await writeFile(listPath, JSON.stringify(list, null, 2) + "\n");
