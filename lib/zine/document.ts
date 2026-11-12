// Builds the magazine as one HTML document that Paged.js lays out into pages. The same
// document is shown in /zine (inside an iframe) and printed to PDF by scripts/zine-pdf.ts,
// so what you see in the preview is what goes to the printer.
import { DEADLINE_LABELS } from "@/convex/lib/program";
import type { ZineArt, ZineEssay, ZineIssue } from "./types";
import qrcode from "qrcode-generator";
import {
  BODY_FONTS,
  DISPLAY_FONTS,
  PALETTES,
  TRIMS,
  margins,
  type Tweaks,
  wordsPerPage,
} from "./tweaks";

export const PAGED_SRC = "/zine/vendor/paged.polyfill.min.js";
const BLEED = 0.125;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Titles as registered sometimes carry the site or author: "… — LessWrong", "… · Name".
export function cleanTitle(e: ZineEssay) {
  const name = e.author.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return e.title
    .replace(new RegExp(`\\s+[—–|·-]\\s+(LessWrong|EA Forum|Substack|Medium|${name})\\s*$`, "i"), "")
    .trim();
}

// Lines inside a paragraph split with <br> become their own paragraphs. Paged.js justifies
// the last line of a paragraph that crosses pages, which stretches every <br> line in it.
const tagBalanced = (s: string) => {
  const open = s.match(/<(em|strong|a|sup|sub|code|s)\b/g)?.length ?? 0;
  const close = s.match(/<\/(em|strong|a|sup|sub|code|s)>/g)?.length ?? 0;
  return open === close;
};
function splitBreaks(html: string) {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner: string) => {
    if (!inner.includes("<br>")) return whole;
    const parts = inner.split(/\s*<br>\s*/).filter((x) => x.trim());
    if (!parts.every(tagBalanced)) return whole;
    return parts.map((x, i) => (i ? `<p class="line">${x}</p>` : `<p>${x}</p>`)).join("");
  });
}

// The end mark goes after the last paragraph's text (CSS :last-child would also match the
// last paragraph on every page once Paged.js splits the body).
function endMark(html: string, t: Tweaks) {
  const mark = { none: "", square: "■", asterism: "⁂", fleuron: "❦" }[t.endMark];
  const i = html.lastIndexOf("</p>");
  if (!mark || i < 0) return html;
  return `${html.slice(0, i)}<span class="end-mark">${mark}</span>${html.slice(i)}`;
}

const countWords = (html: string) =>
  html.replace(/<[^>]+>/g, " ").match(/\p{L}[\p{L}\p{M}'’-]*/gu)?.length ?? 0;

// The first `budget` words of an essay, cut at a block boundary.
function excerpt(html: string, budget: number) {
  const blocks =
    html.match(
      /<(p|h2|h3|h4|blockquote|ul|ol|figure|pre|table)\b[^>]*>[\s\S]*?<\/\1>|<hr>|<img[^>]*>/g,
    ) ?? [];
  let used = 0;
  const kept: string[] = [];
  for (const b of blocks) {
    const n = countWords(b);
    const isImage = /^<(figure|img)/.test(b);
    if (kept.length && used + n > budget && (used + n / 2 > budget || isImage)) break;
    kept.push(b);
    used += n + (isImage ? 120 : 0);
    if (used >= budget) break;
  }
  // Don't end on a heading.
  while (kept.length > 1 && /^<h\d/.test(kept.at(-1)!)) kept.pop();
  return { html: kept.join(""), words: countWords(kept.join("")) };
}

function qr(url: string) {
  const q = qrcode(0, "M");
  q.addData(url);
  q.make();
  return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

// The box at the end of an essay that points to it online: "rest" words left when the
// essay was cut short, 0 when it's printed in full.
function online(e: ZineEssay, rest: number, withQr: boolean) {
  // The QR code has the full link; long paths are shortened so the text stays one line or two.
  const bare = e.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const short = bare.length > 52 ? `${bare.slice(0, 50)}…` : bare;
  const about = (Math.round(rest / 100) * 100 || rest).toLocaleString("en-US");
  // A one-row table: Paged.js keeps a table cell with break-inside: avoid in one piece, but
  // ignores that on a div and would put the QR code and the text on different pages.
  return `<table class="continued${withQr ? "" : " no-qr"}"><tr>
  ${withQr ? `<td class="qr">${qr(e.url)}</td>` : ""}
  <td class="text">
    <div class="k">${rest ? "Continued online" : "Read online"}</div>
    <p>${rest ? `The rest of this essay, about ${about} more words, is at` : "This essay first appeared at"}</p>
    <p class="url">${esc(short)}</p>
  </td>
</tr></table>`;
}

// Orders essays by the Order setting.
export function orderEssays<E extends ZineEssay>(list: E[], t: Tweaks): E[] {
  const out = [...list];
  if (t.order === "author")
    out.sort((a, b) => a.author.name.localeCompare(b.author.name));
  else if (t.order === "length") out.sort((a, b) => a.words - b.words);
  else out.sort((a, b) => a.submittedAt - b.submittedAt);
  return out;
}

// The essays that go in, in order. Pages that couldn't be read are left out.
export function issueEssays(issue: ZineIssue, t: Tweaks): ZineEssay[] {
  const skip = new Set(t.exclude);
  const list = orderEssays(
    issue.essays.filter((e) => !e.error && e.html && !skip.has(e.id)),
    t,
  );
  return t.limit === null ? list : list.slice(0, t.limit);
}

function fontsUrl(t: Tweaks) {
  const fams = [BODY_FONTS[t.bodyFont], DISPLAY_FONTS[t.displayFont]]
    .filter((f) => f.name)
    .map((f) => `family=${f.name.replace(/ /g, "+")}:${f.spec}`);
  return `https://fonts.googleapis.com/css2?${[...new Set(fams)].join("&")}&display=block`;
}

function css(t: Tweaks) {
  const trim = TRIMS[t.trim];
  const m = margins(t);
  const body = BODY_FONTS[t.bodyFont];
  const display = DISPLAY_FONTS[t.displayFont].name || body.name;
  const p = PALETTES[t.palette];
  const size = t.size * body.scale;
  const folioLeft = t.folio === "outer" ? "bottom-left" : "bottom-center";
  const folioRight = t.folio === "outer" ? "bottom-right" : "bottom-center";
  const mark = { none: "", square: "■", asterism: "⁂", fleuron: "❦" }[t.endMark];
  const lines = t.dropCap;
  const folioStyle = `font-family: var(--body); font-size: 8.5pt; letter-spacing: .06em; color: var(--accent); vertical-align: top; padding-top: ${(m.bottom * 0.35).toFixed(2)}in;`;
  const headStyle = `font-family: var(--body); font-style: italic; font-size: 8.5pt; color: var(--ink); vertical-align: bottom; padding-bottom: ${(m.top * 0.38).toFixed(2)}in;`;
  return `
:root {
  --ink: ${p.ink}; --accent: ${p.accent}; --cover: ${p.cover}; --cover-ink: ${p.coverInk};
  --body: "${body.name}", Georgia, serif; --display: "${display}", Georgia, serif;
  --size: ${size.toFixed(2)}pt; --lh: ${t.leading};
}
@page {
  size: ${trim.w}in ${trim.h}in;
  ${t.bleed ? `bleed: ${BLEED}in;` : ""}
  margin: ${m.top}in ${m.outside}in ${m.bottom}in ${m.inside}in;
  font-family: var(--body); color: var(--ink);
}
@page :left {
  margin-left: ${m.outside}in; margin-right: ${m.inside}in;
  @${folioLeft} { content: counter(page); ${folioStyle} }
  ${t.runningHeads ? `@top-left { content: string(author, first-except); ${headStyle} }` : ""}
}
@page :right {
  margin-left: ${m.inside}in; margin-right: ${m.outside}in;
  @${folioRight} { content: counter(page); ${folioStyle} }
  ${t.runningHeads ? `@top-right { content: string(title, first-except); ${headStyle} }` : ""}
}
@page cover {
  margin: 0;
  background: var(--cover);
  @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; }
  @top-left { content: none; } @top-right { content: none; }
}
@page front {
  @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; }
  @top-left { content: none; } @top-right { content: none; }
}
@page title-page {
  margin: 0;
  @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; }
  @top-left { content: none; } @top-right { content: none; }
}

html { font-family: var(--body); font-size: var(--size); line-height: var(--lh); color: var(--ink);
  font-kerning: normal; font-variant-ligatures: common-ligatures; font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased; }
body { margin: 0; }
* { box-sizing: border-box; }
a { color: inherit; text-decoration: none; }

/* Cover */
.cover { page: cover; break-after: page; position: relative;
  width: ${trim.w + (t.bleed ? 2 * BLEED : 0)}in; height: ${trim.h + (t.bleed ? 2 * BLEED : 0)}in;
  ${t.bleed ? `margin: -${BLEED}in;` : ""}
  background: var(--cover); color: var(--cover-ink); overflow: hidden; display: flex; flex-direction: column; }
.cover-inner { position: relative; flex: 1; display: flex; flex-direction: column;
  padding: ${m.top + (t.bleed ? BLEED : 0)}in ${m.outside + (t.bleed ? BLEED : 0)}in ${m.bottom + (t.bleed ? BLEED : 0)}in ${m.inside - 0.1 + (t.bleed ? BLEED : 0)}in; }
.cover-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover-art + .cover-inner { background: linear-gradient(to bottom, transparent 40%, color-mix(in srgb, var(--cover) 85%, transparent)); }
.masthead { font-family: var(--display); font-weight: 400; font-size: ${trim.w * 0.19}in; line-height: .86;
  letter-spacing: -.035em; margin: 0; }
.masthead em { font-style: italic; color: color-mix(in srgb, var(--cover-ink) 60%, var(--accent)); }
.cover-meta { display: flex; justify-content: space-between; font-size: 8.5pt; letter-spacing: .14em;
  text-transform: uppercase; margin-top: .9em; padding-top: .7em; border-top: .6pt solid currentColor; }
.cover-names { position: absolute; left: ${m.inside - 0.1 + (t.bleed ? BLEED : 0)}in; right: ${m.outside + (t.bleed ? BLEED : 0)}in;
  font-family: var(--display); line-height: 1.32;
  display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; column-gap: .3in; }
.cover-names span { display: block; }

/* Contents */
.front { page: front; break-after: page; }
.contents h2 { font-family: var(--display); font-weight: 400; font-size: 26pt; line-height: 1; margin: .2in 0 .35in;
  letter-spacing: -.02em; }
.contents ol { list-style: none; margin: 0; padding: 0; }
.contents li { display: flex; align-items: baseline; gap: .6em; margin: 0 0 .62em; break-inside: avoid; }
.contents .t { font-family: var(--display); font-size: 1.12em; line-height: 1.2; }
.contents .a { display: block; font-size: .78em; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); margin-top: .15em; }
.contents .dots { flex: 1; border-bottom: .5pt dotted color-mix(in srgb, var(--ink) 40%, transparent); transform: translateY(-.25em); min-width: 1em; }
.contents a.n::after { content: target-counter(attr(href), page); font-variant-numeric: oldstyle-nums; }
.issue-line { font-size: .78em; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }

/* Essays */
.essay { break-before: ${t.startRight ? "right" : "page"}; }
.essay-head { margin-bottom: 2.2em; }
.essay-head .title { string-set: title content(text); font-family: var(--display); font-weight: ${t.displayFont === "body" ? 500 : 400};
  font-style: ${t.titleItalic ? "italic" : "normal"}; font-size: ${(t.trim === "8.5x11" ? 30 : 24) * t.titleScale}pt;
  line-height: 1.04; letter-spacing: -.018em; margin: 0; text-wrap: balance; hyphens: manual; }
.essay-head .byline { margin-top: .9em; font-size: .82em; letter-spacing: .14em; text-transform: uppercase; }
.essay-head .byline .name { string-set: author content(text); color: var(--accent); }
.kicker { font-size: .74em; letter-spacing: .18em; text-transform: uppercase; color: var(--accent); margin-bottom: 1.1em; }
.essay-art { display: block; width: 100%; max-height: ${trim.h * 0.36}in; object-fit: contain; mix-blend-mode: multiply; margin: 0 0 1.6em; }

.op-classic .essay-head { text-align: center; padding-top: ${trim.h * 0.06}in; }
.op-classic .essay-head .rule { width: 2.2em; margin: 1.3em auto 0; border-top: .7pt solid var(--accent); }
.op-left .essay-head { padding-top: .1in; border-top: 2.2pt solid var(--ink); padding-top: .9em; }
.op-left .essay-head .title { font-size: ${(t.trim === "8.5x11" ? 36 : 28) * t.titleScale}pt; }
.op-left .rule { display: none; }

.op-titlePage .essay-head { page: title-page; break-after: page; position: relative; margin: 0;
  width: ${trim.w + (t.bleed ? 2 * BLEED : 0)}in; height: ${trim.h + (t.bleed ? 2 * BLEED : 0)}in;
  ${t.bleed ? `margin: -${BLEED}in;` : ""} display: flex; flex-direction: column; }
.op-titlePage .essay-art { flex: 0 0 58%; max-height: none; height: 58%; margin: 0; }
.op-titlePage .head-text { flex: 1; display: flex; flex-direction: column; justify-content: flex-end;
  padding: .5in ${m.outside + (t.bleed ? BLEED : 0)}in ${m.bottom + (t.bleed ? BLEED : 0)}in ${m.inside + (t.bleed ? BLEED : 0)}in; }
.op-titlePage .title { font-size: ${(t.trim === "8.5x11" ? 44 : 34) * t.titleScale}pt; }
.op-titlePage .rule { width: 2.2em; margin-top: 1.2em; border-top: .7pt solid var(--accent); }

.essay-body { ${t.justify ? "text-align: justify; hyphens: auto; -webkit-hyphens: auto;" : "text-align: left; hyphens: manual;"}
  orphans: 2; widows: 2; hanging-punctuation: first;
  ${t.columns === 2 ? "column-count: 2; column-gap: .24in; column-fill: auto;" : ""} }
.essay-body p { margin: 0; ${t.paragraphs === "indent" ? "text-indent: 1.3em;" : "margin-bottom: .75em;"} }
.essay-body > p:first-child, .essay-body h2 + p, .essay-body h3 + p, .essay-body h4 + p, .essay-body blockquote + p, .essay-body figure + p, .essay-body hr + p, .essay-body ul + p, .essay-body ol + p, .essay-body pre + p, .essay-body table + p { text-indent: 0; }
.essay-body p.first:not([data-split-from])::first-line { ${lines ? "" : "font-variant: small-caps; letter-spacing: .03em;"} }
${
  lines
    ? `.essay-body p.first:not([data-split-from])::first-letter { initial-letter: ${lines}; -webkit-initial-letter: ${lines};
  font-family: var(--display); color: var(--accent); font-weight: 400; font-style: normal; margin-right: .1em; }`
    : ""
}
.essay-body h2, .essay-body h3, .essay-body h4 { font-family: var(--display); font-weight: ${t.displayFont === "body" ? 600 : 500}; line-height: 1.2;
  margin: 1.5em 0 .5em; break-after: avoid; text-align: left; hyphens: manual; }
.essay-body h2 { font-size: 1.32em; } .essay-body h3 { font-size: 1.14em; } .essay-body h4 { font-size: 1em; font-style: italic; }
.essay-body p.line { text-indent: 0; }
/* Paged.js justifies the last line of anything split across pages, including the whole
   essay body, which every paragraph would inherit. Only the paragraph itself should. */
.essay-body * { text-align-last: auto; }
${t.justify ? ".essay-body p[data-split-to], .essay-body li[data-split-to] { text-align-last: justify; }" : ""}
.essay-body blockquote { margin: .9em 1.4em; font-size: .94em; }
.essay-body blockquote p { text-indent: 0; margin-bottom: .5em; }
.essay-body ul, .essay-body ol { margin: .6em 0 .8em; padding-left: 1.5em; text-align: left; }
.essay-body li { margin-bottom: .25em; }
.essay-body li p { text-indent: 0; margin: 0; }
.essay-body hr { border: 0; text-align: center; margin: 1.1em 0; height: auto; }
.essay-body hr::after { content: "${t.endMark === "none" ? "⁂" : mark === "■" ? "◆" : mark}"; color: var(--accent); font-size: .9em; letter-spacing: .5em; }
.essay-body figure, .essay-body img { break-inside: avoid; }
.essay-body figure { margin: 1em 0; }
.essay-body img { display: ${t.images === "none" ? "none" : "block"}; max-width: 100%; max-height: ${trim.h * 0.42}in;
  margin: 1em auto; ${t.images === "gray" ? "filter: grayscale(1);" : ""} }
.essay-body figure img { margin: 0 auto .4em; }
.essay-body figcaption { font-size: .78em; text-align: center; font-style: italic; opacity: .8; }
.essay-body pre { font: .78em/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; text-align: left; margin: .8em 0; }
.essay-body code { font-family: ui-monospace, Menlo, monospace; font-size: .86em; }
.essay-body table { border-collapse: collapse; font-size: .82em; margin: 1em 0; width: 100%; text-align: left; }
.essay-body td, .essay-body th { border-bottom: .5pt solid color-mix(in srgb, var(--ink) 25%, transparent); padding: .25em .4em; vertical-align: top; }
.essay-body sup { line-height: 0; font-size: .7em; }
.essay-body .end-mark { color: var(--accent); font-size: .8em; padding-left: .5em; }
.continued { width: 100%; border-collapse: collapse; margin-top: 1.4em; border: .6pt solid var(--accent);
  break-inside: avoid; column-span: all; text-align: left; hyphens: manual; }
.continued td { break-inside: avoid; vertical-align: middle; padding: .16in; }
.continued td.qr { width: .85in; padding-right: 0; }
.continued td.qr svg { width: .85in; height: .85in; }
.continued.no-qr td { padding: .12in .16in; }
/* When the box doesn't fit, Paged.js moves the row to the next page and leaves an empty
   copy of the table behind. */
.continued[data-split-to] { display: none; }
.continued .qr svg { display: block; }
.continued .qr svg path, .continued .qr svg rect[fill="black"] { fill: var(--ink); }
.continued .k { font-size: .74em; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin-bottom: .35em; }
.continued p { margin: 0; text-indent: 0; font-size: .86em; line-height: 1.35; }
.continued .url { font-style: italic; word-break: break-all; hyphens: none; margin-top: .2em; }
.essay-note { margin-top: 1.6em; padding-top: .7em; border-top: .5pt solid color-mix(in srgb, var(--ink) 30%, transparent);
  font-size: .8em; line-height: 1.4; font-style: italic; text-align: left; break-inside: avoid; column-span: all; }

/* Colophon */
.colophon { break-before: page; page: front; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.colophon p { font-size: .82em; line-height: 1.5; max-width: 26em; margin: 0 0 .7em; }
.colophon .masthead-small { font-family: var(--display); font-size: 18pt; margin-bottom: .4em; }
`;
}

// Screen-only styles for the preview: page shadows, spreads, zoom. Paged.js ignores them.
const PREVIEW_CSS = `
@media screen {
  html { background: #e6e2dc; }
  body { padding: 28px 0 80px; }
  .pagedjs_pages { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; margin: 0 auto; zoom: var(--zoom, 1); }
  .pagedjs_page { background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 6px 22px rgba(0,0,0,.10); }
  html.spreads .pagedjs_pages { gap: 28px 0; width: calc(var(--pagedjs-width) * 2); }
  html.spreads .pagedjs_first_page { margin-left: var(--pagedjs-width); }
  html.trim .pagedjs_page { overflow: visible; }
  html.guides .pagedjs_area { outline: 1px dashed rgba(0,120,255,.35); }
  html.guides .pagedjs_bleed { background: repeating-linear-gradient(45deg, rgba(255,0,80,.06) 0 6px, transparent 6px 12px); }
}
@media print { html, body { background: none; } }
`;

// The writers' names sit at the foot of the cover, placed from the top in inches: in print,
// Chrome doesn't give the cover the page's height to push them down with flexbox. Long lists
// get a smaller size so they fit in the lower 40% of the cover.
function namesStyle(count: number, t: Tweaks) {
  const trim = TRIMS[t.trim];
  const m = margins(t);
  const rows = Math.max(1, Math.ceil(count / 2));
  const size = Math.min(14, trim.w * 1.6, (trim.h * 0.4 * 72) / (rows * 1.32));
  const height = (rows * size * 1.32) / 72;
  const top = trim.h - m.bottom - height + (t.bleed ? BLEED : 0);
  return `top: ${top.toFixed(3)}in; font-size: ${size.toFixed(2)}pt; grid-template-rows: repeat(${rows}, auto)`;
}

function cover(issue: ZineIssue, essays: ZineEssay[], art: ZineArt, t: Tweaks, preview: boolean) {
  const label = DEADLINE_LABELS[issue.week - 1] ?? "";
  const names = [...new Set(essays.map((e) => e.author.name))];
  const a = art.cover;
  return `<section class="cover">
  ${a ? `<img class="cover-art" src="${esc((preview && a.web) || a.file)}" alt="${esc(a.alt ?? "")}">` : ""}
  <div class="cover-inner">
    <h1 class="masthead">Just <em>Write</em></h1>
    <div class="cover-meta"><span>Issue ${issue.week}</span><span>${esc(label)}, 2026</span></div>
    <div class="cover-names" style="${namesStyle(names.length, t)}">${names.map((n) => `<span>${esc(n)}</span>`).join("")}</div>
  </div>
</section>`;
}

function contents(issue: ZineIssue, essays: ZineEssay[]) {
  return `<section class="front contents">
  <div class="issue-line">Just Write · Issue ${issue.week}</div>
  <h2>Contents</h2>
  <ol>${essays
    .map(
      (e) => `<li><a href="#e-${e.id}"><span class="t">${esc(cleanTitle(e))}</span><span class="a">${esc(e.author.name)}</span></a><span class="dots"></span><a class="n" href="#e-${e.id}"></a></li>`,
    )
    .join("")}</ol>
</section>`;
}

function essay(e: ZineEssay, issue: ZineIssue, t: Tweaks, art: ZineArt, preview: boolean) {
  const a = t.images === "none" ? undefined : art[e.id];
  const img = a
    ? `<img class="essay-art" src="${esc((preview && a.web) || a.file)}" alt="${esc(a.alt ?? "")}"${t.images === "gray" ? ` style="filter:grayscale(1)"` : ""}>`
    : "";
  const head = `<span class="kicker">Issue ${issue.week}</span>
      <h2 class="title">${esc(cleanTitle(e))}</h2>
      <div class="byline">by <span class="name">${esc(e.author.name)}</span></div>
      <div class="rule"></div>`;
  let body = endMark(splitBreaks(e.html), t);
  let cut = false;
  if (t.length !== "full") {
    // The opener takes about half of the first page; the QR box about a third of one.
    const part = excerpt(e.html, Math.max(150, wordsPerPage(t) * (t.length - 1)));
    if (part.words < e.words - 80) {
      cut = true;
      body = `${splitBreaks(part.html).replace(/<\/p>$/, "…</p>")}${online(e, e.words - part.words, t.qr !== "none")}`;
    }
  }
  // The drop cap goes on the first paragraph only, never on its continuation after a page
  // or column break (Paged.js copies the element, which would match :first-child again).
  body = body.replace(/^<p>/, '<p class="first">');
  const bio = e.author.bio?.trim();
  const bioText = bio ? esc(bio.length > 320 ? `${bio.slice(0, 317)}…` : bio) : "";
  // With QR codes on every essay, the box gives the link, so the note is just the bio.
  const qrAll = t.qr === "all";
  const note = qrAll ? bioText : `${bioText ? `${bioText} ` : ""}First published at ${esc(host(e.url))}.`;
  return `<article class="essay op-${t.opener}" id="e-${e.id}">
  <header class="essay-head">${
    t.opener === "titlePage"
      ? `${img}<div class="head-text">${head}</div>`
      : `${img}${head}`
  }</header>
  <div class="essay-body">${body}</div>
  ${cut ? "" : `${note ? `<p class="essay-note">${note}</p>` : ""}${qrAll ? online(e, 0, true) : ""}`}
</article>`;
}

// Scroll, zoom, spreads, guides, and print for the preview iframe, both while Paged.js
// runs and in a saved copy of its finished pages (cachedDocument).
const PREVIEW_SCRIPT = `let t = 0;
  addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(() => parent.postMessage({ type: "zine:scroll", f: scrollY / Math.max(1, document.documentElement.scrollHeight) }, "*"), 120); });
  addEventListener("message", (ev) => {
    const d = ev.data || {};
    if (d.type === "zine:view") {
      document.documentElement.style.setProperty("--zoom", d.zoom);
      document.documentElement.classList.toggle("spreads", !!d.spreads);
      document.documentElement.classList.toggle("guides", !!d.guides);
    }
    if (d.type === "zine:scrollTo") scrollTo(0, d.f * document.documentElement.scrollHeight);
    if (d.type === "zine:page") document.querySelectorAll(".pagedjs_page")[d.page - 1]?.scrollIntoView();
    if (d.type === "zine:print") print();
  });
  // The laid-out pages as static HTML, without scripts or the preview's view settings.
  function zineSnapshot() {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll("script").forEach((s) => s.remove());
    root.removeAttribute("style");
    root.classList.remove("spreads", "guides");
    return "<!doctype html>\\n" + root.outerHTML;
  }`;

// A saved snapshot of pages Paged.js already laid out, shown without typesetting again.
// Paged.js writes its page styles as plain <style> text, so the copy looks the same. The
// pages are static HTML, so it reports ready as soon as the document is parsed rather than
// after every image and web font has loaded, and it starts in the preview's current view.
export function cachedDocument(
  snapshot: string,
  pages: number,
  view: { zoom: number; spreads: boolean; guides: boolean },
) {
  const script = `<script>
  document.documentElement.style.setProperty("--zoom", ${Number(view.zoom)});
  document.documentElement.classList.toggle("spreads", ${!!view.spreads});
  document.documentElement.classList.toggle("guides", ${!!view.guides});
  ${PREVIEW_SCRIPT}
  addEventListener("DOMContentLoaded", () => parent.postMessage({ type: "zine:done", pages: ${Number(pages)} }, "*"));
</script>`;
  // First thing in <head>, so the stylesheet link after it doesn't hold the script back.
  const head = /<head[^>]*>/i.exec(snapshot);
  if (!head) return script + snapshot;
  const at = head.index + head[0].length;
  return snapshot.slice(0, at) + script + snapshot.slice(at);
}

export function zineDocument(
  issue: ZineIssue,
  art: ZineArt,
  t: Tweaks,
  opts: { base?: string; preview?: boolean } = {},
) {
  const essays = issueEssays(issue, t);
  const body = BODY_FONTS[t.bodyFont].name;
  const display = DISPLAY_FONTS[t.displayFont].name || body;
  const fonts = [body, display].flatMap((f) => [
    `400 12px "${f}"`,
    `italic 400 12px "${f}"`,
    `600 12px "${f}"`,
  ]);
  const names = new Set(essays.map((e) => e.author.name));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${opts.base ? `<base href="${esc(opts.base)}" target="_blank">` : `<base target="_blank">`}
<title>Just Write · Issue ${issue.week}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin data-pagedjs-ignore>
<link rel="stylesheet" href="${fontsUrl(t)}" data-pagedjs-ignore>
<style>${css(t)}</style>
${opts.preview ? `<style data-pagedjs-ignore>${PREVIEW_CSS}</style>` : ""}
<script>
  window.__zine = { started: Date.now() };
  window.PagedConfig = {
    before: async () => {
      await Promise.all(${JSON.stringify(fonts)}.map((f) => document.fonts.load(f).catch(() => null)));
      await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })));
    },
    after: (flow) => {
      window.__zine.done = { pages: flow.total, ms: Date.now() - window.__zine.started };
      parent.postMessage({ type: "zine:done", pages: flow.total${opts.preview ? ", snapshot: zineSnapshot()" : ""} }, "*");
    },
  };
</script>
<script src="${PAGED_SRC}"></script>
<script>
  window.PagedPolyfill.on("page", (p) => parent.postMessage({ type: "zine:progress", pages: p.position + 1 }, "*"));
  ${opts.preview ? PREVIEW_SCRIPT : ""}
</script>
</head>
<body>
${t.cover ? cover(issue, essays, art, t, !!opts.preview) : ""}
${t.contents ? contents(issue, essays) : ""}
${essays.map((e) => essay(e, issue, t, art, !!opts.preview)).join("\n")}
<section class="colophon">
  <div class="masthead-small">Just Write</div>
  <p>Issue ${issue.week} collects ${essays.length} essays by ${names.size} writers, published in the week ending ${esc(DEADLINE_LABELS[issue.week - 1] ?? "")}, 2026. Each essay first appeared online.</p>
  <p>Set in ${esc(body)}${display !== body ? ` and ${esc(display)}` : ""}. justwrite.club</p>
</section>
</body>
</html>`;
}
