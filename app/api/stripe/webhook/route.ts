import { revalidateTag } from "next/cache";
import type Stripe from "stripe";
import { sendSignedTerms } from "@/lib/email";
import { markCommitted, stripe } from "@/lib/stripe";

// Stripe calls this after checkout. Configure it in the Stripe dashboard for:
//   checkout.session.completed, checkout.session.async_payment_succeeded
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret)
    return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      await req.text(),
      signature,
      secret,
    );
  } catch (err) {
    console.error("Stripe webhook signature check failed", err);
    return new Response("Bad signature", { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    let id: Awaited<ReturnType<typeof markCommitted>>;
    try {
      id = await markCommitted(event.data.object);
      if (id != null) revalidateTag("interest", { expire: 0 });
    } catch (err) {
      console.error("markCommitted failed", err);
      return new Response("Database error", { status: 500 }); // Stripe will retry
    }

    if (id != null) {
      try {
        await sendSignedTerms(id);
      } catch (err) {
        console.error("sendSignedTerms failed", err);
        return new Response("Email error", { status: 500 }); // Stripe will retry; markCommitted is idempotent
      }
    }
  }

  return new Response("ok");
}
