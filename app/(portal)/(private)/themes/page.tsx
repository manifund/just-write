import type { Metadata } from "next";
import { Themes } from "./themes";

// Portal pages render behind a client-side sign-in check (components/portal/frame.tsx),
// so there is no prerendered page to validate for instant navigation.
export const instant = false;

export const metadata: Metadata = {
  title: "What we’re writing about · Just Write",
};

export default function Page() {
  return <Themes />;
}
