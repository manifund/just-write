import type { ReactNode } from "react";
import { PortalFrame } from "@/components/portal/frame";
import { Calendar } from "./calendar";
import { getEvents } from "./data";

// Public: members see the calendar inside the portal, everyone else gets a simple header.
// The calendar itself lives here so it stays mounted as /calendar/<slug> URLs change;
// the pages only set metadata.
export default async function CalendarLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PortalFrame membersOnly={false}>
      <Calendar initial={await getEvents()} />
      {children}
    </PortalFrame>
  );
}
