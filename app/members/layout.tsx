import type { ReactNode } from "react";
import { PortalFrame } from "@/components/portal/frame";

// Public pages: members see them inside the portal, everyone else gets a simple header.
export default function MembersLayout({ children }: { children: ReactNode }) {
  return <PortalFrame membersOnly={false}>{children}</PortalFrame>;
}
