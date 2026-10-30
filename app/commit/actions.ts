"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export type CommitState = { status: "idle" } | { status: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "justwrite.club";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Records the signature, then sends the signer to Stripe Checkout for the deposit.
// The Stripe webhook flips them to "committed" once payment succeeds.
export async function startCommitment(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);
  const signature = String(formData.get("signature") ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  const agreed = formData.get("agree") === "on";

  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please add a valid email." };
  if (!agreed) return { status: "error", message: "Please check the box to agree to the terms." };
  if (!signature) return { status: "error", message: "Please type your full name to sign." };

  let checkoutUrl: string;
  try {
    // Matches an existing "interested" row by email, or adds a new one.
    const [row] = (await sql()`
      INSERT INTO interest (name, email, status, signed_name, signed_at)
      VALUES (${signature}, ${email}, 'signed', ${signature}, now())
      ON CONFLICT (email) DO UPDATE SET
        signed_name = EXCLUDED.signed_name,
        signed_at = EXCLUDED.signed_at,
        status = CASE WHEN interest.status = 'committed' THEN 'committed' ELSE 'signed' END
      RETURNING id, status
    `) as { id: number; status: string }[];

    if (row.status === "committed") {
      return { status: "error", message: "You’ve already committed. Thank you! See you in November." };
    }

    const origin = await siteOrigin();
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      customer_email: email,
      client_reference_id: String(row.id),
      metadata: { program: "just-write-nov-2026", interest_id: String(row.id), signed_name: signature },
      payment_intent_data: {
        description: "$1,000 commitment deposit for Just Write (Nov 2026)",
        metadata: { program: "just-write-nov-2026", interest_id: String(row.id), email },
      },
      integration_identifier: "just_write_commit_qvhtmzkr",
      success_url: `${origin}/commit/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/commit?canceled=1`,
    });

    await sql()`UPDATE interest SET stripe_session_id = ${session.id} WHERE id = ${row.id}`;
    checkoutUrl = session.url!;
  } catch (err) {
    console.error("startCommitment failed", err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  redirect(checkoutUrl);
}
