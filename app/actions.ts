"use server";

import { updateTag } from "next/cache";
import { sql } from "@/lib/db";

export type InterestState =
  | { status: "idle" }
  | { status: "ok"; name: string }
  | { status: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts "venki.com" or a full URL; returns a normalized http(s) URL, or null if it isn't usable.
function parseWebsite(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function submitInterest(
  _prev: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 320);

  const link = parseWebsite(String(formData.get("website") ?? "").trim().slice(0, 500));

  if (!name) return { status: "error", message: "Please add your name." };
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Please add a valid email." };
  if (!link) return { status: "error", message: "Please add a valid website link." };

  try {
    // Resubmitting with the same email updates the row instead of adding a duplicate.
    await sql()`
      INSERT INTO interest (name, email, link)
      VALUES (${name}, ${email}, ${link})
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        link = EXCLUDED.link
    `;
  } catch (err) {
    console.error("submitInterest failed", err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  updateTag("interest"); // refresh the "Interested" list
  return { status: "ok", name };
}
