// Lulu calls this when a print job's status changes (register it once with
// scripts/lulu-webhook.ts). Signed with our Lulu client secret.
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { serverSecret } from "@/lib/auth-server";
import { tracking, verifyWebhook, type PrintJob } from "@/lib/lulu";

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyWebhook(body, req.headers.get("lulu-hmac-sha256")))
    return new Response("Bad signature", { status: 401 });
  const event = JSON.parse(body) as { topic?: string; data?: PrintJob };
  if (event.topic !== "PRINT_JOB_STATUS_CHANGED" || !event.data?.id)
    return new Response("ok");
  const job = event.data;
  try {
    await fetchMutation(api.zineOrders.fromLulu, {
      secret: serverSecret(),
      luluJobId: job.id,
      luluStatus: job.status.name,
      tracking: tracking(job),
      message: job.status.message,
    });
  } catch (err) {
    console.error("lulu webhook failed", err);
    return new Response("Error", { status: 500 }); // Lulu retries
  }
  return new Response("ok");
}
