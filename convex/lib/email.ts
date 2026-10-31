// Sends an email through Resend's HTTP API. Without RESEND_API_KEY (local dev),
// it logs the email instead, so magic links show up in the Convex logs.
export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email to ${msg.to}] ${msg.subject}\n${msg.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Just Write <austin@manifund.org>",
      to: msg.to,
      reply_to: "austin@manifund.org",
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}
