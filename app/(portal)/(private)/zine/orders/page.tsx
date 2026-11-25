import type { Metadata } from "next";
import { Orders } from "./orders";

// Portal pages render behind a client-side sign-in check (components/portal/frame.tsx),
// so there is no prerendered page to validate for instant navigation.
export const instant = false;

export const metadata: Metadata = { title: "Zine orders · Just Write" };

export default function Page() {
  return <Orders />;
}
