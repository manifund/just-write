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

console.log("interest table ready");
