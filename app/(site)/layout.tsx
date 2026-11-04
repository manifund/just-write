import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appleWebApp, Document } from "../document";
import { Providers } from "../providers";

const title = "Just Write: 4 essays over 4 weeks";
const description =
  "An online writing club. Commit to a snippet every day & full essay every week in Nov 2026.";

// The share image comes from app/opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL("https://justwrite.club"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Just Write",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  appleWebApp,
};

// Root layout for the public pages. Portal pages have their own in app/(portal)/layout.tsx,
// which reads the session cookie per request; this one stays static.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <Document>
      <Providers>{children}</Providers>
    </Document>
  );
}
