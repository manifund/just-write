"use server";

import { sql } from "@/lib/db";

export type InterestState =
  | { status: "idle" }
  | { status: "ok"; name: string }
  | { status: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitInterest(
  _prev: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);

  if (!name) return { status: "error", message: "Please add your name." };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please add a valid email." };

  try {
    // Resubmitting with the same email updates the name instead of adding a duplicate.
    await sql()`
      INSERT INTO interest (name, email)
      VALUES (${name}, ${email})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    `;
  } catch (err) {
    console.error("submitInterest failed", err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  return { status: "ok", name };
}
