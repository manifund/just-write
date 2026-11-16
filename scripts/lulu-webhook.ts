// Registers the Lulu webhook for print job status changes, once per Lulu account:
//   bun scripts/lulu-webhook.ts https://justwrite.club/api/lulu/webhook
// Needs LULU_CLIENT_KEY and LULU_CLIENT_SECRET (and LULU_ENV=sandbox for the sandbox).
import { registerWebhook } from "../lib/lulu";

const url = process.argv[2] ?? "https://justwrite.club/api/lulu/webhook";
console.log(await registerWebhook(url));
