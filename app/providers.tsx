"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { authClient } from "@/lib/auth-client";
import { pushChatUrl } from "@/lib/chat-url";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Public pages: Better Auth's own provider, which watches the session (so /sign-in can
// redirect once you're in) and fetches a Convex token when there is one.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <NotificationClicks />
      {children}
    </ConvexBetterAuthProvider>
  );
}

// Portal pages: the server turns the session cookie into a Convex token and streams it in
// (app/(portal)/layout.tsx), so the client starts authenticated and connects right away.
// ConvexBetterAuthProvider's `initialToken` would do the same, but it rebuilds its auth
// callback once its own session request returns, which resets the Convex connection and
// flashes the loading screen; this one keeps the callback stable.
//
// The token arrives through a small store rather than props, because the server component
// that fetches it renders beside the page, not around it.
let initialToken: string | null | undefined; // undefined until the server has answered
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const getInitialToken = () => initialToken;
const getServerToken = () => undefined;

export function SetInitialToken({ token }: { token: string | null }) {
  useLayoutEffect(() => {
    if (initialToken !== undefined) return;
    initialToken = token;
    listeners.forEach((fn) => fn());
  }, [token]);
  return null;
}

export function PortalProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePortalAuth}>
      <NotificationClicks />
      {children}
    </ConvexProviderWithAuth>
  );
}

function usePortalAuth() {
  const initial = useSyncExternalStore(
    subscribe,
    getInitialToken,
    getServerToken,
  );
  const latest = useRef<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  // Convex calls this with forceRefreshToken before the token expires (and once right after
  // connecting); a null result means the session is gone, and PortalFrame redirects.
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const known = latest.current ?? initialToken ?? null;
      if (known && !forceRefreshToken) return known;
      const { data } = await authClient.convex.token({
        fetchOptions: { throw: false },
      });
      latest.current = data?.token ?? null;
      if (!latest.current) setSignedOut(true);
      return latest.current;
    },
    [],
  );

  return useMemo(
    () => ({
      isLoading: initial === undefined,
      isAuthenticated: !!initial && !signedOut,
      fetchAccessToken,
    }),
    [initial, signedOut, fetchAccessToken],
  );
}

// When a notification is clicked while the app is open, the service worker
// (public/sw.js) asks the page to go there.
function NotificationClicks() {
  const router = useRouter();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "navigate") return;
      const url = new URL(e.data.url, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = url.pathname + url.search;
      // Chat to chat switches in place, like the sidebar (lib/chat-url.ts).
      if (
        to.startsWith("/chat/") &&
        window.location.pathname.startsWith("/chat/")
      )
        pushChatUrl(to);
      else router.push(to);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
