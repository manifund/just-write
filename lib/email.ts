import { fetchMutation } from "convex/nextjs";
import { Resend } from "resend";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { serverSecret } from "./auth-server";
import { runs, TERMS, type Rich } from "./terms";

const FROM = process.env.RESEND_FROM ?? "Just Write <austin@manifund.org>";
const REPLY_TO = "austin@manifund.org";

let _resend: Resend | null = null;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

type Signed = {
  email: string;
  signedName: string;
  signedAt: number;
  amountPaidCents: number | null;
};

// Emails a committed writer a copy of the terms they signed. Sends at most once per writer:
// the row is claimed before sending, and released if the send fails so a webhook retry can try again.
export async function sendSignedTerms(memberId: Id<"members">): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set; skipping signed-terms email");
    return;
  }

  const secret = serverSecret();
  const row = await fetchMutation(api.server.claimTermsEmail, {
    secret,
    memberId,
  });
  if (!row) return; // already sent, or not committed

  const { error } = await resend().emails.send(
    {
      from: FROM,
      to: row.email,
      replyTo: REPLY_TO,
      subject: "Your signed Just Write commitment",
      html: renderHtml(row),
      text: renderText(row),
    },
    { idempotencyKey: `signed-terms/${memberId}` },
  );

  if (error) {
    await fetchMutation(api.server.releaseTermsEmail, { secret, memberId });
    throw new Error(`Resend failed: ${error.message}`);
  }
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});

function details(row: Signed) {
  const amount =
    row.amountPaidCents == null
      ? "$1,000"
      : `$${(row.amountPaidCents / 100).toLocaleString("en-US")}`;
  return [
    ["Signed by", row.signedName],
    ["Email", row.email],
    ["Signed on", `${dateFmt.format(new Date(row.signedAt))} PT`],
    ["Deposit paid", amount],
  ];
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function richHtml(rich: Rich) {
  return runs(rich)
    .map((r) =>
      typeof r === "string"
        ? esc(r)
        : `<a href="${esc(r.href)}" style="color:#38213f">${esc(r.text)}</a>`,
    )
    .join("");
}

function richText(rich: Rich) {
  return runs(rich)
    .map((r) => (typeof r === "string" ? r : `${r.text} (${r.href})`))
    .join("");
}

function renderHtml(row: Signed) {
  const p = "margin:0 0 12px;font-size:16px;line-height:1.55;color:#644f6b";
  const terms = TERMS.map((t, i) => {
    const parts = [
      `<h2 style="margin:28px 0 8px;font-size:19px;font-weight:600;color:#38213f">${i + 1}. ${esc(t.title)}</h2>`,
    ];
    if (t.intro) parts.push(`<p style="${p}">${richHtml(t.intro)}</p>`);
    if (t.bullets) {
      parts.push(
        `<ul style="margin:0 0 12px;padding-left:22px">${t.bullets
          .map((b) => `<li style="${p};margin-bottom:6px">${richHtml(b)}</li>`)
          .join("")}</ul>`,
      );
    }
    for (const o of t.outro ?? [])
      parts.push(`<p style="${p}">${richHtml(o)}</p>`);
    return parts.join("");
  }).join("");

  const rows = details(row)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;font-size:14px;color:#644f6b;white-space:nowrap">${k}</td><td style="padding:4px 0;font-size:16px;color:#38213f">${esc(v)}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f9eeec">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Georgia,'Times New Roman',serif;color:#38213f">
  <p style="margin:0 0 24px;font-size:22px;font-weight:600">Just <span style="color:#bf5548">Write</span></p>
  <p style="${p}">Hi ${esc(row.signedName)},</p>
  <p style="${p}">Thanks for committing to Just Write! We got your deposit. Here’s a copy of the terms you signed, for your records.</p>
  <table style="margin:20px 0;border-collapse:collapse">${rows}</table>
  ${terms}
  <p style="${p};margin-top:28px">Questions? Just reply to this email. We’re excited to read what you write!</p>
  <p style="${p}">— Austin, Just Write</p>
</div>
</body></html>`;
}

function renderText(row: Signed) {
  const lines = [
    `Hi ${row.signedName},`,
    "",
    "Thanks for committing to Just Write! We got your deposit. Here’s a copy of the terms you signed, for your records.",
    "",
    ...details(row).map(([k, v]) => `${k}: ${v}`),
  ];
  TERMS.forEach((t, i) => {
    lines.push("", `${i + 1}. ${t.title}`, "");
    if (t.intro) lines.push(richText(t.intro));
    for (const b of t.bullets ?? []) lines.push(`  - ${richText(b)}`);
    for (const o of t.outro ?? []) lines.push(richText(o));
  });
  lines.push(
    "",
    "Questions? Just reply to this email. We’re excited to read what you write!",
    "",
    "— Austin, Just Write",
  );
  return lines.join("\n");
}
