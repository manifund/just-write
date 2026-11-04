// Emails a group of members a message written in markdown, through Resend.
//
//   bun scripts/email-blast.ts docs/email-1.md                        # preview: prints recipients and the text, sends nothing
//   bun scripts/email-blast.ts docs/email-1.md --to austin@manifund.org  # send a draft to one address only
//   bun scripts/email-blast.ts docs/email-1.md --send                 # send to everyone in the audience
//
// The file starts with header lines (`Subject: ...` required; `To:`, `From:`, and `Reply-To:`
// optional), then a blank line, then the body. `To:` picks the audience: "committed" (the
// default) or "interested" (expressed interest or signed terms, but never paid the deposit);
// any extra words after it, like "Interested, but not committed", are ignored. Blank lines separate paragraphs, and a block of `1. ` lines
// becomes a numbered list. `{firstname}` is replaced per recipient (or "friend" with no name).
// Markdown links `[text](url)` work in both versions (plain text shows "text (url)"); the HTML
// version also links bare URLs, #channels, and the phrases in LINKS.
// Real sends use the Resend idempotency key blast/<file name>/<email>, so re-running --send
// within 24h won't email anyone twice. Rename the file to send a changed message again.
// Recipients come from `bunx convex data members` (the deployment in .env.local), so nothing
// needs deploying. Needs RESEND_API_KEY (bun reads .env.local).
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { Resend } from "resend";

const SITE = "https://justwrite.club";
const DEFAULT_FROM =
  process.env.RESEND_FROM ?? "Just Write <austin@manifund.org>";
const DEFAULT_REPLY_TO = "austin@manifund.org";
// Link style in the HTML version: the site's muted ink purple (--color-ink-muted).
const A = 'style="color:#644f6b;text-decoration:underline"';

// Phrases that become links in the HTML version (first match wins; case-sensitive).
const LINKS: [RegExp, string][] = [
  [/register it on the site/, `${SITE}/home`],
  [/\bcalendar\b/, `${SITE}/calendar`],
];

// Who a `To:` header can address, by member status.
const AUDIENCES = {
  committed: {
    label: "committed members",
    statuses: ["committed"],
  },
  interested: {
    label: "interested members (not committed)",
    statuses: ["interested", "signed"],
  },
};
type Audience = keyof typeof AUDIENCES;

const [file, ...flags] = process.argv.slice(2);
const send = flags.includes("--send");
const toIndex = flags.indexOf("--to");
const draftTo = toIndex >= 0 ? flags[toIndex + 1] : undefined;
if (!file || (toIndex >= 0 && !draftTo) || (send && draftTo)) {
  console.error(
    "Usage: bun scripts/email-blast.ts <file.md> [--to <email> | --send]",
  );
  process.exit(1);
}

const { headers, body } = parse(await readFile(file, "utf8"));
const subject = headers.subject;
const from = headers.from ?? DEFAULT_FROM;
const replyTo = headers["reply-to"] ?? DEFAULT_REPLY_TO;

// `{firstname}` in the body becomes the member's first name, or "friend" if we don't have one.
function personalize(name: string | undefined) {
  const first = name?.trim().split(/\s+/)[0] || "friend";
  const filled = body.replaceAll("{firstname}", first);
  return { text: plainText(filled), html: renderHtml(filled) };
}

const resendKey = process.env.RESEND_API_KEY;
if (!resendKey) throw new Error("Needs RESEND_API_KEY");

const audience = pickAudience(headers.to);
const members = await loadMembers(audience);

console.log(`From: ${from}\nReply-To: ${replyTo}\nSubject: ${subject}\n\n${body}\n`);
console.log(`${members.length} ${AUDIENCES[audience].label}:`);
for (const m of members) console.log(`  ${m.email}  (${m.name})`);
console.log();

if (!send && !draftTo) {
  console.log("Preview only. Pass --to <email> for a draft or --send to send.");
  process.exit(0);
}

const resend = new Resend(resendKey);
const slug = basename(file).replace(/\.md$/, "");
// A draft to a member's address uses their name; to anyone else, the fallback.
const recipients: { email: string; name?: string }[] = draftTo
  ? [
      members.find((m) => m.email === draftTo.toLowerCase()) ?? {
        email: draftTo,
      },
    ]
  : members;
let failed = 0;
for (const [i, { email: to, name }] of recipients.entries()) {
  if (i > 0) await sleep(600); // Resend allows ~2 requests/second
  const { data, error } = await resend.emails.send(
    { from, to, replyTo, subject, ...personalize(name) },
    draftTo ? undefined : { idempotencyKey: `blast/${slug}/${to}` },
  );
  if (error) {
    failed++;
    console.error(`FAILED ${to}: ${error.message}`);
  } else {
    console.log(`sent ${to} ${data?.id ?? ""}`);
  }
}
console.log(
  `\n${recipients.length - failed} sent, ${failed} failed${draftTo ? " (draft)" : ""}.`,
);
if (failed) process.exit(1);

function pickAudience(to: string | undefined): Audience {
  const first = (to ?? "committed").trim().toLowerCase().split(/[\s,]+/)[0];
  if (first in AUDIENCES) return first as Audience;
  throw new Error(
    `Unknown "To:" audience "${to}". Use one of: ${Object.keys(AUDIENCES).join(", ")}`,
  );
}

// Members in the audience (never the bot), via the Convex CLI so no new function has to be deployed.
async function loadMembers(audience: Audience) {
  const { stdout } = await promisify(execFile)("bunx", [
    "convex",
    "data",
    "members",
    "--limit",
    "10000",
    "--format",
    "jsonl",
  ]);
  const rows = stdout
    .split("\n")
    .filter((l) => l.trim())
    .map(
      (l) =>
        JSON.parse(l) as {
          name: string;
          email: string;
          status: string;
          bot?: boolean;
        },
    );
  return rows
    .filter((m) => AUDIENCES[audience].statuses.includes(m.status) && !m.bot)
    .map(({ name, email }) => ({ name, email }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function parse(src: string) {
  const [head, ...rest] = src.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const headers: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!m)
      throw new Error(
        `${file} must start with header lines like "Subject: ...", then a blank line`,
      );
    headers[m[1].toLowerCase()] = m[2].trim();
  }
  if (!headers.subject) throw new Error(`${file} needs a "Subject:" header`);
  return {
    headers: headers as { subject: string } & Record<string, string>,
    body: rest.join("\n\n").trim(),
  };
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escapes a line and turns URLs, #channels, and LINKS phrases into links, in one pass so
// a later pattern never matches inside an earlier link.
function inline(line: string) {
  // Group numbers: 1-3 markdown link (whole, text, href); 4 bare URL; 5-6 #channel (whole,
  // slug); 7+ one per LINKS phrase. Markdown links go first so their URL isn't matched bare.
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
  const url = /https?:\/\/[^\s<>"]+/;
  const channel = /#([a-z0-9][a-z0-9-]*)/;
  const parts = [mdLink, url, channel, ...LINKS.map(([re]) => re)];
  const re = new RegExp(parts.map((p) => `(${p.source})`).join("|"), "g");
  let out = "";
  let last = 0;
  for (const m of line.matchAll(re)) {
    const start = m.index!;
    out += esc(line.slice(last, start));
    let hit = m[0];
    let href: string;
    if (m[1]) {
      out += `<a href="${esc(m[3])}" ${A}>${esc(m[2])}</a>`;
      last = start + hit.length;
      continue;
    }
    if (m[4]) {
      // Keep trailing punctuation outside the link.
      const trail = hit.match(/[.,!?;:)]+$/)?.[0] ?? "";
      hit = hit.slice(0, hit.length - trail.length);
      href = hit;
      out += `<a href="${esc(href)}" ${A}>${esc(hit)}</a>${esc(trail)}`;
      last = start + m[0].length;
      continue;
    }
    if (m[6]) href = `${SITE}/chat/${m[6]}`;
    else {
      const which = m.slice(7).findIndex((g) => g !== undefined);
      href = LINKS[which][1];
    }
    out += `<a href="${esc(href)}" ${A}>${esc(hit)}</a>`;
    last = start + hit.length;
  }
  return out + esc(line.slice(last));
}

// The plain-text version: markdown links become "text (url)".
function plainText(body: string) {
  return body.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}

function renderHtml(body: string) {
  const p = "margin:0 0 16px;font-size:16px;line-height:1.55";
  const numbered = /^\d+\.\s+/;
  // Within a block (lines between blank lines), runs of `1. ` lines become a numbered list
  // and the other lines a paragraph, so an intro line can sit right above its list.
  const blocks = body.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; ) {
      const isList = numbered.test(lines[i]);
      let j = i;
      while (j < lines.length && numbered.test(lines[j]) === isList) j++;
      const run = lines.slice(i, j);
      if (isList) {
        const items = run
          .map(
            (l) =>
              `<li style="${p};margin-bottom:6px">${inline(l.replace(numbered, ""))}</li>`,
          )
          .join("");
        out.push(`<ol style="margin:0 0 16px;padding-left:24px">${items}</ol>`);
      } else {
        const next = j < lines.length ? ";margin-bottom:6px" : "";
        out.push(`<p style="${p}${next}">${run.map(inline).join("<br>")}</p>`);
      }
      i = j;
    }
    return out.join("\n");
  });
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:600px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#38213f">
${blocks.join("\n")}
</div>
</body></html>`;
}
