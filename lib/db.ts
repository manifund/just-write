import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Created lazily so `next build` works without DATABASE_URL set.
let _sql: NeonQueryFunction<false, false> | null = null;

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

// interested → signed (agreed to terms, sent to Stripe) → committed (deposit paid)
export type Status = "interested" | "signed" | "committed";

export type Submission = {
  id: number;
  name: string;
  email: string;
  link: string | null;
  status: Status;
  signed_name: string | null;
  signed_at: string | null;
  committed_at: string | null;
  stripe_payment_intent: string | null;
  created_at: string;
};
