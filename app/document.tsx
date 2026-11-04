import { Atkinson_Hyperlegible_Next, Fraunces } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Name and status bar for "Add to Home Screen" on iOS; the rest is in app/manifest.ts.
export const appleWebApp = {
  capable: true,
  title: "Just Write",
  statusBarStyle: "default",
} as const;

// The <html> shell shared by both root layouts, app/(site) and app/(portal).
export function Document({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${atkinson.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
