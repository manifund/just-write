import type { ReactNode } from "react";
import { PortalFrame } from "@/components/portal/frame";

// Member-only pages. /members and /calendar sit beside this group: public, but inside the
// same root layout so the sidebar can move between them without a full page load.
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <PortalFrame membersOnly>{children}</PortalFrame>;
}
