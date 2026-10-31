import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/convex/_generated/api";
import { Profile } from "./profile";

async function getProfile(handle: string) {
  "use cache";
  cacheLife("minutes");
  try {
    return await fetchQuery(api.members.profile, { handle });
  } catch (err) {
    console.error("getProfile failed", err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/members/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const data = await getProfile(handle);
  if (!data) return { title: "Member · Just Write" };
  return {
    title: `${data.member.name} · Just Write`,
    description:
      data.member.bio ??
      `${data.member.name} is writing 4 essays in November with Just Write.`,
  };
}

export default function MemberPage({ params }: PageProps<"/members/[handle]">) {
  return (
    <Suspense fallback={null}>
      <ProfileFromParams params={params} />
    </Suspense>
  );
}

async function ProfileFromParams({
  params,
}: {
  params: PageProps<"/members/[handle]">["params"];
}) {
  const { handle } = await params;
  const data = await getProfile(handle);
  if (!data) notFound();
  return <Profile handle={handle} initial={data} />;
}
