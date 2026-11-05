import type { Metadata } from "next";
import { Suspense } from "react";
import { ChannelFromUrl } from "@/components/portal/channel";

// Portal pages render behind a client-side sign-in check (components/portal/frame.tsx),
// so there is no prerendered page to validate for instant navigation.
export const instant = false;

// The channel name is added to the title in the browser (see Channel).
export const metadata: Metadata = { title: "Chat · Just Write" };

// The slug is read in the browser rather than from `params`, so this page has nothing
// to render on the server and switching channels doesn't wait on a server request.
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChannelFromUrl />
    </Suspense>
  );
}
