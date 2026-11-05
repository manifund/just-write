"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { Avatar } from "@/components/portal/avatar";
import { useMember } from "@/components/portal/context";
import { timeAgo, useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

type Item = NonNullable<typeof api.activity.feed._returnType>["items"][number];

export function Activity() {
  const feed = useQuery(api.activity.feed);
  const markSeen = useMutation(api.activity.markSeen).withOptimisticUpdate(
    (store) => {
      const cur = store.getQuery(api.activity.feed, {});
      if (cur)
        store.setQuery(
          api.activity.feed,
          {},
          {
            items: cur.items.map((i) => ({ ...i, read: true })),
            unread: 0,
          },
        );
    },
  );
  const markRead = useMutation(api.activity.markRead).withOptimisticUpdate(
    (store, { messageId }) => {
      const cur = store.getQuery(api.activity.feed, {});
      if (!cur) return;
      const items = cur.items.map((i) =>
        i._id === messageId ? { ...i, read: true } : i,
      );
      store.setQuery(
        api.activity.feed,
        {},
        { items, unread: items.filter((i) => !i.read).length },
      );
    },
  );
  const now = useNow();
  const unread = feed?.unread ?? 0;

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
        {unread > 0 && (
          <button
            type="button"
            onClick={() => void markSeen().catch(() => {})}
            className="cursor-pointer self-start text-[15px] text-ink-muted underline"
          >
            Mark all as read
          </button>
        )}
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
              now={now}
              onRead={() => {
                if (!item.read)
                  void markRead({ messageId: item._id }).catch(() => {});
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function Row({
  item,
  now,
  onRead,
}: {
  item: Item;
  now: number | null;
  onRead: () => void;
}) {
  const isNew = !item.read;
  const author = useMember(item.authorId);
  const name = author?.name ?? "Someone";
  return (
    <li className="relative border-b border-ink/10">
      <Link
        href={`/chat/${item.channel.slug}/${item.threadId}`}
        onClick={onRead}
        className={`flex gap-3 px-3 py-4 no-underline transition-colors hover:bg-ink/4 ${isNew ? "bg-brass/10 pr-28" : ""}`}
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
      {isNew && (
        <button
          type="button"
          onClick={onRead}
          className="absolute top-4 right-3 flex cursor-pointer items-center gap-2 text-[14px] text-ink-muted hover:text-ink"
        >
          <span className="size-2 rounded-full bg-brass" aria-hidden />
          Mark read
        </button>
      )}
    </li>
  );
}
