import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import type { ZineArt, ZineDefaults, ZineIssue } from "@/lib/zine/types";
import { Zine } from "./zine";

// Portal pages render behind a client-side sign-in check (components/portal/frame.tsx),
// so there is no prerendered page to validate for instant navigation.
export const instant = false;

export const metadata: Metadata = { title: "Zine · Just Write" };

// The cached issues (content/zine/week-<n>.json, from scripts/zine-cache.ts), the art
// manifest, and the default design's pages (defaults.json, from scripts/zine-pages.ts). next.config.ts traces content/zine into this route.
async function load() {
  "use cache";
  const dir = join(process.cwd(), "content/zine");
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => /^week-\d+\.json$/.test(f))
    .sort();
  const issues = await Promise.all(
    files.map(
      async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as ZineIssue,
    ),
  );
  const art = JSON.parse(
    await readFile(join(dir, "art.json"), "utf8").catch(() => "{}"),
  ) as ZineArt;
  const defaults = JSON.parse(
    await readFile(join(dir, "defaults.json"), "utf8").catch(() => "{}"),
  ) as ZineDefaults;
  return { issues, art, defaults };
}

export default async function Page() {
  const { issues, art, defaults } = await load();
  return <Zine issues={issues} art={art} defaults={defaults} />;
}
