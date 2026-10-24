// Creates the database table. Safe to re-run.
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

console.log("interest table ready");
