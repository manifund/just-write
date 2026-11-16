import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type Stripe from "stripe";
import { sendSignedTerms } from "@/lib/email";
import { markCommitted, markZinePaid, stripe } from "@/lib/stripe";
import { startPrint } from "@/lib/zine/fulfill";

export const maxDuration = 300; // a paid /zine order starts its sandbox after we answer

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
    // A printed zine (/zine's Order panel), not a deposit.
    if (event.data.object.metadata?.kind === "zine") {
      let orderId: Awaited<ReturnType<typeof markZinePaid>>;
      try {
        orderId = await markZinePaid(event.data.object);
      } catch (err) {
        console.error("markZinePaid failed", err);
        return new Response("Database error", { status: 500 });
      }
      // Rendering takes minutes, so it starts after we answer Stripe. A failure is saved on
      // the order, where admins can retry it from /zine/orders.
      if (orderId) {
        const origin = new URL(req.url).origin;
        after(() => startPrint(orderId, origin).catch((e) => console.error("startPrint failed", e)));
      }
      return new Response("ok");
    }
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
