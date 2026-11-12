// Saves one week's essays into the repo for the magazine (/zine).
//
//   bun scripts/zine-cache.ts            # week 1
//   bun scripts/zine-cache.ts --week 2
//   bun scripts/zine-cache.ts --only <essayId>   # refetch one essay, keep the rest
//
// Reads the essays and members tables with `bunx convex data` (needs CONVEX_DEPLOYMENT, as
// for `bun convex`), picks the essays that fill that week's slot (convex/lib/program.ts
// fillSlots), fetches each page, keeps the article (Mozilla Readability), and cleans it to a
// small set of tags. Writes content/zine/week-<n>.json and downloads images into
// public/zine/week-<n>/. Only names, handles, and bios leave the members table.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fillSlots } from "../convex/lib/program";
import type { ZineEssay, ZineIssue } from "../lib/zine/types";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const week = Number(flag("--week") ?? 1);
const only = flag("--only");

const run = promisify(execFile);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IMAGE_MAX = 4_000_000;

type Row = Record<string, unknown> & { _id: string };

async function table(name: string): Promise<Row[]> {
  const { stdout: out } = await run(
    "bunx",
    ["convex", "data", name, "--limit", "100000", "--format", "jsonLines"],
    { maxBuffer: 1 << 28 },
  );
  return out
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as Row);
}

// Google Docs: the published HTML export has the real text; the editor page is all scripts.
function fetchUrl(url: string) {
  const doc = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  return doc
    ? `https://docs.google.com/document/d/${doc[1]}/export?format=html`
    : url;
}

const KEEP = new Set([
  "p", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "em", "strong", "b", "i", "a",
  "img", "figure", "figcaption", "hr", "pre", "code", "sup", "sub", "br", "table",
  "thead", "tbody", "tr", "td", "th", "s",
]);
const DROP = new Set([
  "script", "style", "noscript", "svg", "iframe", "form", "button", "input", "nav",
  "footer", "header", "aside", "video", "audio", "source", "template",
]);
const RENAME: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4", b: "strong", i: "em" };

type El = {
  tagName: string;
  childNodes: Node[];
  getAttribute(n: string): string | null;
};
type Node = { nodeType: number; textContent: string | null } & Partial<El>;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: string) => esc(s).replace(/"/g, "&quot;");

// Rebuilds the article as plain HTML from the whitelist. Unknown wrappers (div, span, section)
// are unwrapped; their text stays. Google Docs marks italics and bold with inline styles.
export function clean(node: Node, images: { src: string }[], base: string): string {
  if (node.nodeType === 3) return esc(node.textContent ?? "");
  if (node.nodeType !== 1) return "";
  const el = node as El;
  let tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return "";
  const inner = () => el.childNodes.map((c) => clean(c, images, base)).join("");
  if (tag === "img") {
    const src = el.getAttribute("src") ?? el.getAttribute("data-src");
    if (!src || src.startsWith("data:")) return "";
    let abs: string;
    try {
      abs = new URL(src, base).href;
    } catch {
      return "";
    }
    images.push({ src: abs });
    const alt = el.getAttribute("alt") ?? "";
    return `<img src="${attr(abs)}" alt="${attr(alt)}">`;
  }
  if (tag === "picture") {
    return inner();
  }
  tag = RENAME[tag] ?? tag;
  if (!KEEP.has(tag)) {
    const style = el.getAttribute("style") ?? "";
    const body = inner();
    if (tag === "span" && body.trim()) {
      const italic = /font-style:\s*italic/.test(style);
      const bold = /font-weight:\s*(700|bold)/.test(style);
      let out = body;
      if (italic) out = `<em>${out}</em>`;
      if (bold) out = `<strong>${out}</strong>`;
      return out;
    }
    return /^(div|section|article|main)$/.test(tag) && body.trim() && !/<(p|h\d|ul|ol|blockquote|figure|pre|table)\b/.test(body)
      ? `<p>${body}</p>`
      : body;
  }
  if (tag === "br" || tag === "hr") return `<${tag}>`;
  if (tag === "a") {
    const href = el.getAttribute("href");
    let abs = "";
    try {
      abs = href ? new URL(href, base).href : "";
    } catch {}
    // Google Docs wraps every link in a redirect.
    const g = abs.match(/^https:\/\/www\.google\.com\/url\?q=([^&]+)/);
    if (g) abs = decodeURIComponent(g[1]);
    const body = inner();
    return abs.startsWith("http") ? `<a href="${attr(abs)}">${body}</a>` : body;
  }
  const body = inner();
  if (!body.trim() && tag !== "td" && tag !== "th") return "";
  return `<${tag}>${body}</${tag}>`;
}

// A Google Docs HTML export styles text with classes (.c3{font-style:italic}). Turns those
// into inline styles, which clean() reads, and drops the doc's own title line.
export function googleDocBody(raw: string) {
  const css = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? "";
  const rules = new Map<string, string>();
  for (const m of css.matchAll(/\.(c\d+)\{([^}]*)\}/g)) rules.set(m[1], m[2]);
  const { document } = parseHTML(raw);
  for (const el of document.querySelectorAll("[class]")) {
    const style = (el.getAttribute("class") ?? "")
      .split(/\s+/)
      .map((c) => rules.get(c) ?? "")
      .join(";");
    el.setAttribute("style", style);
  }
  document.querySelector("p.title")?.remove();
  document.querySelector("p.subtitle")?.remove();
  return document.body?.innerHTML ?? "";
}

// Tidies the cleaned HTML: empty paragraphs, a leading heading that repeats the title.
function tidy(html: string, title: string) {
  let out = html
    .replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, "")
    .replace(/(<br>\s*){2,}/g, "</p><p>")
    .replace(/\s+/g, " ")
    .trim();
  const norm = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\W+/g, "").toLowerCase();
  const first = out.match(/^<h[2-4]>(.*?)<\/h[2-4]>/);
  if (first && norm(first[1]) === norm(title)) out = out.slice(first[0].length).trim();
  return out;
}

const words = (html: string) =>
  html.replace(/<[^>]+>/g, " ").match(/\p{L}[\p{L}\p{M}'’-]*/gu)?.length ?? 0;

async function saveImage(src: string, dir: string, prefix: string) {
  try {
    const res = await fetch(src, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > IMAGE_MAX) return null;
    const ext =
      type.includes("png") ? "png"
      : type.includes("gif") ? "gif"
      : type.includes("webp") ? "webp"
      : type.includes("svg") ? "svg"
      : "jpg";
    const name = `${prefix}-${createHash("sha1").update(src).digest("hex").slice(0, 10)}.${ext}`;
    await writeFile(`${dir}/${name}`, buf);
    return name;
  } catch {
    return null;
  }
}

export async function readEssay(
  e: Row,
  author: Row,
  imgDir: string,
  publicDir: string,
): Promise<ZineEssay> {
  const url = e.url as string;
  const base: ZineEssay = {
    id: e._id,
    title: e.title as string,
    url,
    submittedAt: e.submittedAt as number,
    author: {
      name: author.name as string,
      handle: (author.handle as string | undefined) ?? null,
      bio: (author.bio as string | undefined) ?? null,
    },
    html: "",
    words: 0,
    fetchedAt: Date.now(),
    error: null,
  };
  try {
    const res = await fetch(fetchUrl(url), {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    const gdoc = fetchUrl(url) !== url;
    const article = gdoc
      ? { content: googleDocBody(raw), excerpt: null }
      : new Readability(parseHTML(raw).document as unknown as Document, {
          charThreshold: 300,
          keepClasses: false,
        }).parse();
    if (!article?.content) throw new Error("no article found on the page");
    const { document: frag } = parseHTML(`<html><body>${article.content}</body></html>`);
    const images: { src: string }[] = [];
    let html = tidy(
      (frag.body.childNodes as unknown as Node[]).map((n) => clean(n, images, res.url)).join(""),
      base.title,
    );
    for (const [i, img] of images.entries()) {
      const name = await saveImage(img.src, imgDir, `${e._id.slice(-8)}-${i}`);
      html = html.split(`src="${attr(img.src)}"`).join(
        name ? `src="${publicDir}/${name}"` : `data-missing="1" src=""`,
      );
    }
    html = html.replace(/<img data-missing="1" src=""[^>]*>/g, "");
    const n = words(html);
    if (n < 150) throw new Error(`only ${n} words found (sign-in wall or script-built page?)`);
    return { ...base, html, words: n, excerpt: article.excerpt ?? null };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const [essays, members] = await Promise.all([table("essays"), table("members")]);
  const byId = new Map(members.map((m) => [m._id, m]));
  const mine = new Map<string, Row[]>();
  for (const e of essays) {
    const list = mine.get(e.memberId as string) ?? [];
    list.push(e);
    mine.set(e.memberId as string, list);
  }
  const picked: { essay: Row; author: Row }[] = [];
  for (const [memberId, list] of mine) {
    const author = byId.get(memberId);
    if (!author || author.status !== "committed" || author.bot) continue;
    const slots = fillSlots(
      list as unknown as { _id: string; submittedAt: number; review: string; week?: number }[],
    );
    for (const id of slots[week - 1]?.essayIds ?? []) {
      const essay = list.find((e) => e._id === id);
      if (essay) picked.push({ essay, author });
    }
  }
  picked.sort((a, b) => (a.essay.submittedAt as number) - (b.essay.submittedAt as number));
  console.log(`week ${week}: ${picked.length} essays`);

  const file = `content/zine/week-${week}.json`;
  const publicDir = `/zine/week-${week}`;
  const imgDir = `public${publicDir}`;
  await mkdir("content/zine", { recursive: true });
  await mkdir(imgDir, { recursive: true });
  const previous: ZineIssue | null = await readFile(file, "utf8")
    .then((s) => JSON.parse(s) as ZineIssue)
    .catch(() => null);

  const out: ZineEssay[] = [];
  const queue = [...picked];
  const workers = Array.from({ length: 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const kept = only && previous?.essays.find((p) => p.id === job!.essay._id);
      const essay =
        kept && job.essay._id !== only
          ? kept
          : await readEssay(job.essay, job.author, imgDir, publicDir);
      console.log(
        `${essay.error ? "✗" : "✓"} ${essay.author.name}: ${essay.title}${essay.error ? ` (${essay.error})` : ` (${essay.words} words)`}`,
      );
      out.push(essay);
    }
  });
  await Promise.all(workers);
  out.sort((a, b) => a.submittedAt - b.submittedAt);
  const issue: ZineIssue = { week, cachedAt: Date.now(), essays: out };
  await writeFile(file, JSON.stringify(issue, null, 1) + "\n");
  const failed = out.filter((e) => e.error);
  console.log(`wrote ${file}: ${out.length - failed.length} read, ${failed.length} failed`);
}

if (process.argv[1]?.endsWith("zine-cache.ts")) await main();
