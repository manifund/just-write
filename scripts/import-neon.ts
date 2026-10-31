// One-time copy of the old Neon `interest` table into Convex `members`. Safe to re-run (matches by email).
//
//   bun scripts/import-neon.ts            # into the deployment in NEXT_PUBLIC_CONVEX_URL (dev, from .env.local)
//   CONVEX_URL=https://<prod>.convex.cloud CONVEX_SERVER_SECRET=<prod secret> bun scripts/import-neon.ts
import { neon } from "@neondatabase/serverless";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
const secret = process.env.CONVEX_SERVER_SECRET;
if (!url || !secret || !process.env.DATABASE_URL) {
  throw new Error("Needs DATABASE_URL, CONVEX_SERVER_SECRET, and CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)");
}

const sql = neon(process.env.DATABASE_URL);
const rows = (await sql`
  SELECT id, name, email, link, status, signed_name, signed_at, committed_at, created_at,
         stripe_session_id, stripe_payment_intent, amount_paid_cents, terms_emailed_at
  FROM interest ORDER BY id
`) as Record<string, unknown>[];

const ms = (v: unknown) => (v == null ? null : new Date(v as string).getTime());
const str = (v: unknown) => (v == null ? null : String(v));

const result = await new ConvexHttpClient(url).mutation(api.server.importLegacy, {
  secret,
  rows: rows.map((r) => ({
    legacyId: Number(r.id),
    createdAt: ms(r.created_at)!,
    name: String(r.name),
    email: String(r.email),
    link: str(r.link),
    status: r.status as "interested" | "signed" | "committed",
    signedName: str(r.signed_name),
    signedAt: ms(r.signed_at),
    committedAt: ms(r.committed_at),
    stripeSessionId: str(r.stripe_session_id),
    stripePaymentIntent: str(r.stripe_payment_intent),
    amountPaidCents: r.amount_paid_cents == null ? null : Number(r.amount_paid_cents),
    termsEmailedAt: ms(r.terms_emailed_at),
  })),
});
console.log(`Imported ${rows.length} rows into ${url}:`, result);
