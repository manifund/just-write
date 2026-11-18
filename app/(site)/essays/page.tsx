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
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
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
  const name = (
    <span className="font-semibold text-ink">{essay.author.name}</span>
  );
  return (
    <article className="flex gap-3 border-b border-ink/10 px-4 py-4 sm:px-5">
      {profile ? (
        <Link href={profile} className="shrink-0">
          <Avatar member={essay.author} size={44} />
        </Link>
      ) : (
        <Avatar member={essay.author} size={44} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[15px] leading-tight">
          {profile ? (
            <Link href={profile} className="no-underline hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          {essay.author.handle && (
            <span className="text-ink-muted">@{essay.author.handle}</span>
          )}
          <span className="text-ink-muted" aria-hidden="true">
            ·
          </span>
          <time
            dateTime={new Date(essay.submittedAt).toISOString()}
            title={fullFormat.format(essay.submittedAt)}
            className="text-ink-muted"
          >
            {dateFormat.format(essay.submittedAt)}
          </time>
        </div>
        {essay.summary && (
          <p className="text-[15px] leading-[1.45] text-pretty text-ink">
            {essay.summary}
          </p>
        )}
        <a
          href={essay.url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="block overflow-hidden rounded-2xl border border-ink/15 no-underline transition-colors hover:bg-cream-deep"
        >
          {essay.image && (
            // eslint-disable-next-line @next/next/no-img-element -- remote cover images, any host
            <img
              src={essay.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="aspect-[1.91/1] w-full border-b border-ink/10 object-cover"
            />
          )}
          <div className="flex flex-col gap-0.5 px-3.5 py-2.5">
            <span className="text-[13px] text-ink-muted">
              {host(essay.url)}
            </span>
            <span className="font-display text-[17px] leading-snug text-ink">
              {essay.title}
            </span>
          </div>
        </a>
        <div className="flex items-center gap-5 text-[13px] text-ink-muted">
          {essay.likes !== null && (
            <span
              className="flex items-center gap-1.5"
              title={`${essay.likes} ${essay.likes === 1 ? "like" : "likes"} on Substack`}
            >
              <Heart />
              {essay.likes.toLocaleString("en-US")}
            </span>
          )}
          {essay.wordCount !== null && (
            <span>{essay.wordCount.toLocaleString("en-US")} words</span>
          )}
        </div>
      </div>
    </article>
  );
}

// Every essay as a post in a feed, newest first.
export default async function EssaysPage() {
  const essays = await getFeed();
  return (
    <main className="min-h-dvh bg-cream text-ink">
      <div className="mx-auto max-w-[600px] border-x border-ink/10 bg-paper">
        <header className="sticky top-0 z-10 flex items-baseline justify-between gap-4 border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex flex-col">
            <h1 className="font-display text-[22px] font-medium">Essays</h1>
            <span className="text-[13px] text-ink-muted">
              {essays.length} {essays.length === 1 ? "essay" : "essays"},
              newest first
            </span>
          </div>
          <nav className="flex gap-4 text-[14px]">
            <Link href="/">Just Write</Link>
            <Link href="/members">Members</Link>
          </nav>
        </header>
        {essays.length === 0 ? (
          <p className="px-5 py-10 text-center text-ink-muted">
            No essays yet.
          </p>
        ) : (
          essays.map((e) => <Post key={e._id} essay={e} />)
        )}
      </div>
    </main>
  );
}
