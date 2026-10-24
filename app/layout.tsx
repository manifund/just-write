import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Fraunces } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://justwrite.club"),
  title: "Just Write",
  description:
    "4-week online writing club. Publish a snippet every day, full essay every week.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${atkinson.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
