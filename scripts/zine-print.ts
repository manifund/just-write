// Renders one /zine order's print files: the interior PDF and the wraparound cover PDF.
// app/api/zine/print/route.ts runs it in a Vercel Sandbox with the job in ZINE_JOB; it holds
// no secrets, only the order's one-time key and two Convex upload URLs.
//
//   1. Lays out the interior (the order's design, without the cover page, with bleed).
//   2. Uploads it and reports its page count; the route answers with Lulu's cover size.
//   3. Lays out the cover sheet at that size, uploads it, and reports it; the route then
//      sends the print job to Lulu.
//
// Try it locally (writes the PDFs, uploads and reports nothing):
//   bun scripts/zine-print.ts --dry --week 1 [--cover-width 17.6 --cover-height 11.25]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { coverDocument, zineDocument } from "../lib/zine/document";
import { readTweaks } from "../lib/zine/tweaks";
import type { ZineArt, ZineIssue } from "../lib/zine/types";
import { withLaidOut } from "./zine-browser";

type Job = {
  orderId: string;
  token: string;
  week: number;
  tweaks: unknown;
  finishUrl: string; // app/api/zine/print on the site that started this
  interiorUpload: string;
  coverUpload: string;
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = args.includes("--dry");
const job: Job = dry
  ? {
      orderId: "dry",
      token: "",
      week: Number(flag("--week") ?? 1),
      tweaks: JSON.parse(flag("--tweaks") ?? "{}"),
      finishUrl: "",
      interiorUpload: "",
      coverUpload: "",
    }
  : JSON.parse(process.env.ZINE_JOB ?? "null");
if (!job) throw new Error("ZINE_JOB is not set");

const out = "out/zine/print";
await mkdir(out, { recursive: true });

async function report(body: Record<string, unknown>) {
  if (dry) return dryAnswer(body);
  const res = await fetch(job.finishUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ print: { orderId: job.orderId, token: job.token, ...body } }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`report ${body.stage} failed (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text || "{}") as { cover?: { widthIn: number; heightIn: number } };
}

function dryAnswer(body: Record<string, unknown>) {
  console.log("would report", body);
  if (body.stage !== "interior") return {};
  // Lulu's perfect-bound formula for 444 ppi paper, for trying this without keys.
  const pages = Number(body.pages);
  return {
    cover: {
      widthIn: Number(flag("--cover-width") ?? 2 * 8.5 + pages / 444 + 0.06 + 0.25),
      heightIn: Number(flag("--cover-height") ?? 11.25),
    },
  };
}

async function upload(url: string, file: Buffer) {
  if (dry) return "dry";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/pdf" },
    body: new Uint8Array(file),
  });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  return ((await res.json()) as { storageId: string }).storageId;
}

try {
  const issue = JSON.parse(
    await readFile(`content/zine/week-${job.week}.json`, "utf8"),
  ) as ZineIssue;
  const art = JSON.parse(
    await readFile("content/zine/art.json", "utf8").catch(() => "{}"),
  ) as ZineArt;
  const tweaks = { ...readTweaks(job.tweaks), cover: false, bleed: true };

  const interior = await withLaidOut(zineDocument(issue, art, tweaks), async (page, pages) => ({
    pages,
    pdf: await page.pdf({ preferCSSPageSize: true, printBackground: true }),
  }));
  await writeFile(`${out}/interior.pdf`, interior.pdf);
  console.log(`interior: ${interior.pages} pages`);
  const interiorId = await upload(job.interiorUpload, interior.pdf);
  const { cover: size } = await report({ stage: "interior", storageId: interiorId, pages: interior.pages });
  if (!size) throw new Error("no cover size in the answer");

  const cover = await withLaidOut(
    coverDocument(issue, art, tweaks, size),
    (page) => page.pdf({ preferCSSPageSize: true, printBackground: true }),
    { paged: false },
  );
  await writeFile(`${out}/cover.pdf`, cover);
  console.log(`cover: ${size.widthIn.toFixed(3)} × ${size.heightIn.toFixed(3)} in`);
  const coverId = await upload(job.coverUpload, cover);
  await report({ stage: "cover", storageId: coverId });
  console.log("done");
} catch (err) {
  console.error(err);
  await report({ stage: "failed", error: String(err instanceof Error ? err.message : err).slice(0, 500) }).catch(() => {});
  process.exit(1);
}
