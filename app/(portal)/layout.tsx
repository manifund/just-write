import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { PortalFrame } from "@/components/portal/frame";

export const metadata: Metadata = {
  title: "Just Write",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PortalFrame membersOnly>{children}</PortalFrame>
      {/* Portal pages are per-user and load in the browser, so mark them as rendered per request.
          (PortalFrame shows a loading screen during prerender, so nothing inside it does this.) */}
      <Suspense>
        <RequestTime />
      </Suspense>
    </>
  );
}

async function RequestTime() {
  await connection();
  return null;
}
