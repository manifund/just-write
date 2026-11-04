"use client";

import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { unsubscribeDevice } from "./push";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), convexClient()],
});

// Signs out. Turns off this browser's push notifications first, so the next person to
// use it doesn't get this account's messages. (The server drops the row once the push
// service reports it gone.)
export async function signOut() {
  await unsubscribeDevice().catch(() => null);
  await authClient.signOut();
}
