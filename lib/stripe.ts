import Stripe from "stripe";
import { sql } from "./db";

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
// Returns the row id if a row was updated, else null.
export async function markCommitted(session: Stripe.Checkout.Session): Promise<number | null> {
  if (session.payment_status === "unpaid") return null;
  const id = Number(session.client_reference_id);
  if (!Number.isInteger(id)) return null;

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const rows = await sql()`
    UPDATE interest SET
      status = 'committed',
      committed_at = COALESCE(committed_at, now()),
      stripe_session_id = ${session.id},
      stripe_payment_intent = ${paymentIntent},
      amount_paid_cents = ${session.amount_total}
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0 ? id : null;
}
