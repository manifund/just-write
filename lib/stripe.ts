import { fetchMutation } from "convex/nextjs";
import Stripe from "stripe";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { serverSecret } from "./auth-server";

// Deposits are taken as a donation to Manifund and refunded on completion.
let _stripe: Stripe | null = null;

export function stripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Marks the signer as committed once Stripe confirms payment. Safe to call more than once.
// Returns the member id if a row was updated, else null.
export async function markCommitted(session: Stripe.Checkout.Session): Promise<Id<"members"> | null> {
  if (session.payment_status === "unpaid" || !session.client_reference_id) return null;
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  return await fetchMutation(api.server.markCommitted, {
    secret: serverSecret(),
    reference: session.client_reference_id,
    sessionId: session.id,
    paymentIntent,
    amountCents: session.amount_total,
  });
}
