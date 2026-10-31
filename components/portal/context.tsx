"use client";

import { useQuery } from "convex/react";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PublicMember } from "@/convex/lib/viewer";

type Viewer = NonNullable<typeof api.members.viewer._returnType>;
type Me = PublicMember & { status: string; email: string };

type Portal = {
  viewer: Viewer;
  me: Me;
  // Every member's public card, by id, for chat authors and presence.
  roster: Map<string, PublicMember>;
};

const PortalContext = createContext<Portal | null>(null);

export function PortalProvider({ viewer, me, children }: { viewer: Viewer; me: Me; children: ReactNode }) {
  const rows = useQuery(api.members.roster);
  const roster = useMemo(() => {
    const map = new Map<string, PublicMember>((rows ?? []).map((m) => [m._id, m]));
    if (!map.has(me._id)) map.set(me._id, me);
    return map;
  }, [rows, me]);
  return <PortalContext value={{ viewer, me, roster }}>{children}</PortalContext>;
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used inside the portal");
  return ctx;
}

export function useMember(id: Id<"members"> | string | null | undefined) {
  const { roster } = usePortal();
  return id ? roster.get(id) ?? null : null;
}
