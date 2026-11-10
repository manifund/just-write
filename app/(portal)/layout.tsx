import { getSessionCookie } from "better-auth/cookies";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { getToken } from "@/lib/auth-server";
import { appleWebApp, Document } from "../document";
import { PortalProviders, SetInitialToken } from "../providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://justwrite.club"),
  title: "Just Write",
  robots: { index: false, follow: false },
  appleWebApp,
};

// Root layout for the portal, separate from app/(site) so it can read the session cookie
// on every request without making the public pages dynamic. Everything the sidebar links
// to lives under it (member-only pages in (private), plus the public /members and
// /calendar), so those are client-side navigations; coming in from the landing page
// or /sign-in is a full page load, which is fine.
//
// The token streams in beside the page rather than wrapping it, so the page itself stays
// in the prerendered shell (PortalFrame shows its loading screen until the token arrives)
// and the response starts before the cookie is looked at.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Document>
      <PortalProviders>{children}</PortalProviders>
      <Suspense>
        <SessionToken />
      </Suspense>
    </Document>
  );
}

// Turns the viewer's session cookie into a Convex token, so the browser opens its Convex
// connection already signed in instead of asking /api/auth for the session and then a
// token first (two proxied round trips). Without a session cookie there's nothing to ask,
// so signed-out visitors skip the Convex call entirely.
async function SessionToken() {
  const token = getSessionCookie(await headers()) ? await getToken() : null;
  return <SetInitialToken token={token ?? null} />;
}
