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

export type Submission = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};
