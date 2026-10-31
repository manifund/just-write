"use client";

import usePresence from "@convex-dev/presence/react";
import { api } from "@/convex/_generated/api";
import { usePortal } from "./context";

// Joins a presence room and returns the members currently online in it.
export function useRoom(roomId: string) {
  const { me, roster } = usePortal();
  const state = usePresence(api.presence, roomId, me._id);
  return (state ?? [])
    .filter((p) => p.online)
    .map((p) => roster.get(p.userId))
    .filter((m) => m !== undefined);
}
