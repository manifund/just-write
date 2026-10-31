"use server";

import { fetchMutation } from "convex/nextjs";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/convex";

export type InterestState =
  { status: "idle" } | { status: "error"; message: string };

export async function submitInterest(
  _prev: InterestState,
  formData: FormData,
): Promise<InterestState> {
  try {
    await fetchMutation(api.members.expressInterest, {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      website: String(formData.get("website") ?? ""),
    });
    updateTag("interest"); // refresh the "Interested" list
  } catch (err) {
    console.error("submitInterest failed", err);
    return { status: "error", message: errorMessage(err) };
  }
  redirect("/commit");
}
