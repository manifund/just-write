"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Avatar } from "./avatar";
import { PortalProvider, usePortal } from "./context";
import { useRoom } from "./presence";

// Wraps portal pages. With `membersOnly`, signed-out visitors go to /sign-in and
// non-members see how to join; otherwise (public pages like /members) they get a simple header.
export function PortalFrame({ children, membersOnly }: { children: ReactNode; membersOnly: boolean }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.members.viewer, isAuthenticated ? {} : "skip");
  const router = useRouter();

  useEffect(() => {
    if (membersOnly && !isLoading && !isAuthenticated) {
      // Read the path here rather than with usePathname, which would block prerendering public pages.
      router.replace(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [membersOnly, isLoading, isAuthenticated, router]);

  const loading = isLoading || (isAuthenticated && viewer === undefined);
  if (loading) return membersOnly ? <Loading /> : <PublicFrame>{children}</PublicFrame>;

  if (viewer?.canEnter && viewer.member) {
    return (
      <PortalProvider viewer={viewer} me={viewer.member}>
        <Shell>{children}</Shell>
      </PortalProvider>
    );
  }
  if (!membersOnly) return <PublicFrame signedIn={!!viewer}>{children}</PublicFrame>;
  if (!viewer) return <Loading />; // redirecting to sign-in
  // Admins can enter without a member row; syncProfile creates one.
  if (viewer.canEnter) return <CreateAdminRow />;
  return <NotYet status={viewer.member?.status ?? null} email={viewer.user.email} />;
}

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <span className="font-display text-[25px] font-medium opacity-40 motion-safe:animate-pulse">
        Just <span className="text-brass">Write</span>
      </span>
    </div>
  );
}

function CreateAdminRow() {
  const sync = useMutation(api.members.syncProfile);
  useEffect(() => {
    void sync();
  }, [sync]);
  return <Loading />;
}

function NotYet({ status, email }: { status: string | null; email: string }) {
  return (
    <main className="flex min-h-dvh flex-col bg-ink px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)] text-cream">
      <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-10">
        <Link href="/" className="font-display text-[25px] font-medium tracking-[-0.01em] no-underline">
          Just <span className="text-brass-light">Write</span>
        </Link>
        <div className="my-auto flex flex-col gap-5">
          <h1 className="font-display text-[clamp(40px,6vw,64px)] leading-none font-[340] tracking-[-0.025em] text-balance">
            {status === "signed" ? "One step left." : "The portal is for committed writers."}
          </h1>
          <p className="text-[19px] leading-[1.5] text-pretty text-wash-light">
            {status === "signed"
              ? "You signed the terms but haven’t finished your deposit yet. Once it goes through, you’re in."
              : `You’re signed in as ${email}, but we don’t have a deposit for that email yet. If you committed with a different email, sign in with that one.`}
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/commit" className="bg-cream px-6 py-3 text-[18px] text-ink no-underline">
              {status === "signed" ? "Finish committing →" : "Commit to Just Write →"}
            </Link>
            <button
              type="button"
              onClick={() => authClient.signOut().then(() => window.location.assign("/sign-in"))}
              className="cursor-pointer text-[17px] text-wash-light underline"
            >
              Use a different account
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function PublicFrame({ children, signedIn }: { children: ReactNode; signedIn?: boolean }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-baseline justify-between gap-4 bg-ink px-[clamp(20px,4vw,56px)] py-5 text-cream">
        <Link href="/" className="font-display text-[25px] font-medium tracking-[-0.01em] no-underline">
          Just <span className="text-brass-light">Write</span>
        </Link>
        <nav className="flex gap-5 text-[15px] text-wash-light">
          <Link href="/members">Members</Link>
          {!signedIn && <Link href="/sign-in?next=/home">Sign in</Link>}
        </nav>
      </header>
      {children}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { me } = usePortal();
  const sync = useMutation(api.members.syncProfile);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the mobile drawer on navigation.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    void sync();
  }, [sync]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col bg-ink text-cream transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </aside>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-ink/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="-m-2 cursor-pointer p-2"
          >
            <svg aria-hidden="true" width="22" height="16" viewBox="0 0 22 16" stroke="currentColor" strokeWidth="1.6">
              <path d="M0 1h22M0 8h22M0 15h22" />
            </svg>
          </button>
          <Link href="/home" className="font-display text-[21px] font-medium no-underline">
            Just <span className="text-brass-numeral">Write</span>
          </Link>
          <Link href="/settings" className="ml-auto" aria-label="Your profile">
            <Avatar member={me} size={30} />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const navLink =
  "flex items-center gap-2.5 px-3 py-1.5 text-[16px] no-underline transition-colors hover:bg-cream/8";

function Sidebar() {
  const { me, viewer } = usePortal();
  const pathname = usePathname();
  const channels = useQuery(api.chat.channels);
  const online = useRoom("portal");

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const cls = (href: string) => `${navLink} ${active(href) ? "bg-cream/12 text-cream" : "text-wash-light"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 py-5">
      <Link href="/home" className="px-6 font-display text-[25px] font-medium tracking-[-0.01em] no-underline">
        Just <span className="text-brass-light">Write</span>
      </Link>

      <nav aria-label="Portal" className="flex flex-col px-3">
        <Link href="/home" className={cls("/home")}>
          <span aria-hidden="true" className="w-5 text-center">✦</span> Home
        </Link>
        <Link href="/ideas" className={cls("/ideas")}>
          <span aria-hidden="true" className="w-5 text-center">☆</span> Ideas
        </Link>
        <Link href="/members" className={cls("/members")}>
          <span aria-hidden="true" className="w-5 text-center">◎</span> Members
        </Link>
        {viewer.isAdmin && (
          <Link href="/admin" className={cls("/admin")}>
            <span aria-hidden="true" className="w-5 text-center">⚙</span> Admin
          </Link>
        )}
      </nav>

      <nav aria-label="Channels" className="flex min-h-0 flex-col overflow-y-auto px-3">
        <p className="px-3 pb-1.5 text-[12px] tracking-[0.14em] text-brass-light uppercase">Channels</p>
        {channels?.map((c) => (
          <Link key={c._id} href={`/chat/${c.slug}`} className={`${cls(`/chat/${c.slug}`)} ${c.unread ? "font-bold text-cream" : ""}`}>
            <span aria-hidden="true" className="w-5 text-center opacity-60">#</span>
            <span className="truncate">{c.name}</span>
            {c.unread && !active(`/chat/${c.slug}`) && (
              <span className="ml-auto size-2 rounded-full bg-brass-light" aria-label="unread" />
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4 px-6">
        {online.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] tracking-[0.14em] text-brass-light uppercase">
              Here now · {online.length}
            </p>
            <div className="flex flex-wrap gap-1.5 text-ink">
              {online.slice(0, 14).map((m) => (
                <Link key={m._id} href={m.handle ? `/members/${m.handle}` : "/members"} title={m.name}>
                  <Avatar member={m} size={30} online />
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 border-t border-cream/15 pt-4 text-ink">
          <Avatar member={me} size={34} />
          <div className="flex min-w-0 flex-col text-cream">
            <Link href="/settings" className="truncate text-[16px] no-underline hover:underline">
              {me.name}
            </Link>
            <button
              type="button"
              onClick={() => authClient.signOut().then(() => window.location.assign("/"))}
              className="cursor-pointer self-start text-[14px] text-wash-light hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
