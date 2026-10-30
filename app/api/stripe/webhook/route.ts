import { revalidateTag } from "next/cache";
import type Stripe from "stripe";
import { markCommitted, stripe } from "@/lib/stripe";

// Stripe calls this after checkout. Configure it in the Stripe dashboard for:
//   checkout.session.completed, checkout.session.async_payment_succeeded
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature check failed", err);
    return new Response("Bad signature", { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    try {
      if (await markCommitted(event.data.object)) revalidateTag("interest", { expire: 0 });
    } catch (err) {
      console.error("markCommitted failed", err);
      return new Response("Database error", { status: 500 }); // Stripe will retry
    }
  }

  return new Response("ok");
}
