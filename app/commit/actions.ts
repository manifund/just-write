"use server";

import { fetchMutation } from "convex/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { fetchAuthMutation, serverSecret } from "@/lib/auth-server";
import { errorMessage } from "@/lib/convex";
import { stripe } from "@/lib/stripe";

export type CommitState =
  { status: "idle" } | { status: "error"; message: string };

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "justwrite.club";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Records the signed-in writer's signature, then sends them to Stripe Checkout for the deposit.
// The Stripe webhook flips them to "committed" once payment succeeds.
export async function startCommitment(
  _prev: CommitState,
  formData: FormData,
): Promise<CommitState> {
  const signature = String(formData.get("signature") ?? "");
  if (formData.get("agree") !== "on") {
    return {
      status: "error",
      message: "Please check the box to agree to the terms.",
    };
  }

  let checkoutUrl: string;
  try {
    const { memberId, email, alreadyCommitted } = await fetchAuthMutation(
      api.members.signTerms,
      { signature },
    );
    if (alreadyCommitted) {
      return {
        status: "error",
        message: "You’ve already committed. Thank you! See you in November.",
      };
    }

    const origin = await siteOrigin();
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      customer_email: email,
      client_reference_id: memberId,
      metadata: {
        program: "just-write-nov-2026",
        member_id: memberId,
        signed_name: signature.trim(),
      },
      payment_intent_data: {
        description: "$1,000 commitment deposit for Just Write (Nov 2026)",
        metadata: {
          program: "just-write-nov-2026",
          member_id: memberId,
          email,
        },
      },
      integration_identifier: "just_write_commit_qvhtmzkr",
      success_url: `${origin}/commit/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/commit?canceled=1`,
    });

    await fetchMutation(api.server.recordStripeSession, {
      secret: serverSecret(),
      memberId,
      sessionId: session.id,
    });
    checkoutUrl = session.url!;
  } catch (err) {
    console.error("startCommitment failed", err);
    return { status: "error", message: errorMessage(err) };
  }

  redirect(checkoutUrl);
}
