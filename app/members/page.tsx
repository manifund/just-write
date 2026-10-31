import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { api } from "@/convex/_generated/api";
import { Directory } from "./directory";

export const metadata: Metadata = {
  title: "Members · Just Write",
  description: "The writers of Just Write, Nov 2026: 4 essays over 4 weeks.",
  alternates: { canonical: "/members" },
};

async function getDirectory() {
  "use cache";
  cacheLife("minutes");
  try {
    return await fetchQuery(api.members.directory, {});
  } catch (err) {
    console.error("getDirectory failed", err);
    return [];
  }
}

export default async function MembersPage() {
  const initial = await getDirectory();
  return <Directory initial={initial} />;
}
