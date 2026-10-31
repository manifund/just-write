"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { SignInPanel } from "@/components/sign-in";

const noop = () => () => {};

// Only same-site paths, so ?next= can't send people elsewhere.
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home";
}

export function SignIn() {
  const next = useSyncExternalStore(
    noop,
    () => safeNext(new URLSearchParams(window.location.search).get("next")),
    () => "/home",
  );
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  useEffect(() => {
    if (isAuthenticated) router.replace(next);
  }, [isAuthenticated, next, router]);

  return <SignInPanel next={next} />;
}
