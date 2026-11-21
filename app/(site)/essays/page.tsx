import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Avatar } from "@/components/portal/avatar";
import { api } from "@/convex/_generated/api";
import { substackLikes } from "./likes";

export const metadata: Metadata = {
  title: "Essays · Just Write",
  description: "Every essay published in Just Write, Nov 2026, newest first.",
  alternates: { canonical: "/essays" },
};

type FeedEssay = Awaited<
  ReturnType<typeof fetchQuery<typeof api.essays.feed>>
>[number];

async function getFeed(): Promise<(FeedEssay & { likes: number | null })[]> {
  "use cache";
  cacheTag("essays");
  cacheLife("minutes");
  let rows: FeedEssay[];
  try {
    rows = await fetchQuery(api.essays.feed, {});
  } catch (err) {
    console.error("getFeed failed", err);
    return [];
  }
  // A few at a time, so a long list doesn't open dozens of requests at once.
  const likes: (number | null)[] = [];
  for (let i = 0; i < rows.length; i += 8)
    likes.push(
      ...(await Promise.all(
        rows.slice(i, i + 8).map((e) => substackLikes(e.url)),
      )),
    );
  return rows.map((e, i) => ({ ...e, likes: likes[i] }));
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});
const fullFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[15px]">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.5 6.6 4.5c2.2 0 3.6 1.3 5.4 3.3 1.8-2 3.2-3.3 5.4-3.3 3.6 0 5.4 3.8 3.8 6.9C19 15.6 12 20 12 20z"
      />
    </svg>
  );
}

function Post({ essay }: { essay: FeedEssay & { likes: number | null } }) {
  const profile = essay.author.handle
    ? `/members/${essay.author.handle}`
    : null;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper transition-[border-color,box-shadow] hover:border-ink/25 hover:shadow-[0_6px_24px_-12px_rgb(56_33_63/0.35)]">
      {essay.image && (
        // eslint-disable-next-line @next/next/no-img-element -- remote cover images, any host
        <img
          src={essay.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-[1.91/1] w-full border-b border-ink/10 bg-cream-deep object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-3 px-5 pt-4 pb-5">
        <span className="text-[13px] text-ink-muted">
          {host(essay.url)}
        </span>
        <h2 className="font-display text-[21px] leading-[1.2] font-medium tracking-[-0.01em] text-balance text-ink">
          {/* The title's link covers the whole card; the author link sits above it. */}
          <a
            href={essay.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="no-underline after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {essay.title}
          </a>
        </h2>
        {essay.quote && (
          <blockquote className="border-l-2 border-brass pl-3.5 font-display text-[16px] leading-[1.5] text-pretty text-ink-muted italic">
            {essay.quote}
          </blockquote>
        )}
        <div className="mt-auto flex items-center gap-2.5 pt-2 text-[13px]">
          {profile ? (
            <Link
              href={profile}
              className="relative z-10 flex min-w-0 items-center gap-2 no-underline hover:underline"
            >
              <Avatar member={essay.author} size={28} />
              <span className="truncate font-semibold text-ink">
                {essay.author.name}
              </span>
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar member={essay.author} size={28} />
              <span className="truncate font-semibold text-ink">
                {essay.author.name}
              </span>
            </span>
          )}
          <time
            dateTime={new Date(essay.submittedAt).toISOString()}
            title={fullFormat.format(essay.submittedAt)}
            className="shrink-0 text-ink-muted"
          >
            {dateFormat.format(essay.submittedAt)}
          </time>
          <span className="ml-auto flex shrink-0 items-center gap-3.5 text-ink-muted">
            {essay.wordCount !== null && (
              <span>{essay.wordCount.toLocaleString("en-US")} words</span>
            )}
            {essay.likes !== null && (
              <span
                className="flex items-center gap-1"
                title={`${essay.likes} ${essay.likes === 1 ? "like" : "likes"} on Substack`}
              >
                <Heart />
                {essay.likes.toLocaleString("en-US")}
              </span>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

// Every essay as a card, newest first: one column on phones, up to three on desktop.
export default async function EssaysPage() {
  const essays = await getFeed();
  const writers = new Set(essays.map((e) => e.author.name)).size;
  return (
    <main className="min-h-dvh bg-cream text-ink">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-[clamp(16px,4vw,48px)] pt-6 pb-16 sm:gap-10 sm:pt-8">
        <header className="flex flex-col gap-6 sm:gap-10">
          <div className="flex items-baseline justify-between gap-4">
            <Link
              href="/"
              className="font-display text-[22px] font-medium tracking-[-0.01em] text-ink no-underline"
            >
              Just <span className="text-brass">Write</span>
            </Link>
            <nav className="flex gap-5 text-[14px]">
              <Link href="/members">Members</Link>
              <Link href="/home">Sign in</Link>
            </nav>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[clamp(36px,6vw,56px)] leading-none font-medium tracking-[-0.02em]">
              Essays
            </h1>
            <p className="text-[15px] text-ink-muted">
              {essays.length} {essays.length === 1 ? "essay" : "essays"} by{" "}
              {writers} {writers === 1 ? "writer" : "writers"} in November 2026,
              newest first.
            </p>
          </div>
        </header>
        {essays.length === 0 ? (
          <p className="py-10 text-center text-ink-muted">No essays yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {essays.map((e) => (
              <Post key={e._id} essay={e} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
