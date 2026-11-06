"use client";

import { optInOn } from "@/lib/opt-ins";
import { useOptionalPortal } from "./context";

// Whether the signed-in member has this opt-in on (see lib/opt-ins.ts). False when signed out.
export function useOptIn(key: string) {
  return optInOn(key, useOptionalPortal()?.me ?? null);
}
