"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { useMember } from "@/components/portal/context";
import { timeAgo, useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

type Item = NonNullable<typeof api.activity.feed._returnType>["items"][number];

export function Activity() {
  const feed = useQuery(api.activity.feed);
  const markSeen = useMutation(api.activity.markSeen);
  const now = useNow();
  // Remember what was new when the page opened, so it stays marked while they read.
  const [seenAt, setSeenAt] = useState<number | null>(null);
  if (feed && seenAt === null) setSeenAt(feed.seenAt);

  const unread = feed?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) void markSeen().catch(() => {});
  }, [unread, markSeen]);

  return (
    <main className="mx-auto flex max-w-[48rem] flex-col gap-[clamp(24px,4vh,40px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(38px,5.2vw,64px)] leading-none font-[340] tracking-[-0.025em]">
          Activity
        </h1>
        <p className="max-w-[36em] text-[clamp(17px,2.2vw,20px)] leading-[1.45] text-pretty text-ink-muted">
          Mentions of you and replies in threads you’re in, from the last 30
          days.
        </p>
      </header>
      {feed === undefined ? null : feed.items.length === 0 ? (
        <p className="text-[18px] text-ink-muted">
          Nothing yet. When someone mentions you or replies in a thread you’re
          in, it shows up here.
        </p>
      ) : (
        <ul className="flex flex-col border-t border-ink/10">
          {feed.items.map((item) => (
            <Row
              key={item._id}
              item={item}
              isNew={item.createdAt > (seenAt ?? feed.seenAt)}
              now={now}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function Row({
  item,
  isNew,
  now,
}: {
  item: Item;
  isNew: boolean;
  now: number | null;
}) {
  const author = useMember(item.authorId);
  const name = author?.name ?? "Someone";
  return (
    <li className="border-b border-ink/10">
      <Link
        href={`/chat/${item.channel.slug}/${item.threadId}`}
        className={`flex gap-3 px-3 py-4 no-underline transition-colors hover:bg-ink/4 ${isNew ? "bg-brass/10" : ""}`}
      >
        <Avatar member={author} size={36} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[16px]">
            <span>
              <strong className="font-semibold">{name}</strong>{" "}
              {item.kind === "mention" ? "mentioned you" : "replied"} in #
              {item.channel.name}
            </span>
            {now !== null && (
              <span className="text-[14px] text-ink-muted">
                {timeAgo(item.createdAt, now)}
              </span>
            )}
            {isNew && (
              <span
                className="ml-auto size-2 self-center rounded-full bg-brass"
                aria-label="new"
              />
            )}
          </p>
          {item.parentText && (
            <p className="truncate text-[15px] text-ink-muted">
              Thread: {item.parentText}
            </p>
          )}
          <p className="line-clamp-3 text-[17px] leading-[1.45] whitespace-pre-line">
            {item.text}
          </p>
        </div>
      </Link>
    </li>
  );
}
