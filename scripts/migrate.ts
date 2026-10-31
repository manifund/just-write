// Creates and updates the database table. Safe to re-run.
// Usage: bun db:migrate   (bun loads DATABASE_URL from .env.local)
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

await sql`
  CREATE TABLE IF NOT EXISTS interest (
    id serial PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;

// Optional personal website, shown on the landing page's "Interested" list.
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS link text`;
await sql`ALTER TABLE interest ALTER COLUMN link DROP DEFAULT, ALTER COLUMN link DROP NOT NULL`;

// Commitment flow (/commit):
//   interested → signed (agreed to terms, sent to Stripe) → committed (deposit paid)
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'interested'`;
await sql`
  DO $$ BEGIN
    ALTER TABLE interest ADD CONSTRAINT interest_status_check
      CHECK (status IN ('interested', 'signed', 'committed'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$
`;
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS signed_name text`; // typed signature
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS signed_at timestamptz`;
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS committed_at timestamptz`;
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS stripe_session_id text`;
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS stripe_payment_intent text`;
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS amount_paid_cents integer`;
await sql`ALTER TABLE interest ADD COLUMN IF NOT EXISTS terms_emailed_at timestamptz`; // signed-terms copy sent

console.log("interest table ready");
