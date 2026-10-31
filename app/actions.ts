"use server";

import { fetchMutation } from "convex/nextjs";
import { updateTag } from "next/cache";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/convex";

export type InterestState =
  | { status: "idle" }
  | { status: "ok"; name: string }
  | { status: "error"; message: string };

export async function submitInterest(_prev: InterestState, formData: FormData): Promise<InterestState> {
  try {
    const { name } = await fetchMutation(api.members.expressInterest, {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      website: String(formData.get("website") ?? ""),
    });
    updateTag("interest"); // refresh the "Interested" list
    return { status: "ok", name };
  } catch (err) {
    console.error("submitInterest failed", err);
    return { status: "error", message: errorMessage(err) };
  }
}
