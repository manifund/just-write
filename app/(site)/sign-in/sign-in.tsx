"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { SignInPanel } from "@/components/sign-in";

const noop = () => () => {};

// Only same-site paths, so ?next= can't send people elsewhere. It's resolved the way the
// browser will, which catches tricks like "/\evil.com" that look like paths.
function safeNext(raw: string | null) {
  if (!raw?.startsWith("/")) return "/home";
  try {
    const { origin } = window.location;
    const url = new URL(raw, origin);
    const path = url.pathname + url.search + url.hash;
    // Check the normalized path too: "/.//evil.com" normalizes to "//evil.com".
    if (url.origin === origin && new URL(path, origin).origin === origin)
      return path;
  } catch {}
  return "/home";
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
