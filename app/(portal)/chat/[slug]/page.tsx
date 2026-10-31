import type { Metadata } from "next";
import { Suspense } from "react";
import { Channel } from "@/components/portal/channel";

// Portal pages render behind a client-side sign-in check (components/portal/frame.tsx),
// so there is no prerendered page to validate for instant navigation.
export const instant = false;

// The channel name is added to the title in the browser (see Channel).
export const metadata: Metadata = { title: "Chat · Just Write" };

export default function ChatPage({ params }: PageProps<"/chat/[slug]">) {
  return (
    <Suspense fallback={null}>
      <ChannelFromParams params={params} />
    </Suspense>
  );
}

async function ChannelFromParams({ params }: { params: PageProps<"/chat/[slug]">["params"] }) {
  const { slug } = await params;
  return <Channel slug={slug} />;
}
