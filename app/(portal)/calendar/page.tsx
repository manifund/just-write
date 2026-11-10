import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calendar · Just Write",
  description:
    "Writing circles, sessions, and essay deadlines for Just Write, Nov 2026.",
  alternates: { canonical: "/calendar" },
};

// The calendar renders in layout.tsx.
export default function CalendarPage() {
  return null;
}
