"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { RichText } from "@/components/portal/rich-text";
import { api } from "@/convex/_generated/api";
import { fmtLongDay, fmtTime } from "@/convex/lib/time";

export function MyCheckIns() {
  const posts = useQuery(api.chat.myCheckIns);

  return (
    <main className="mx-auto flex max-w-[48rem] flex-col gap-[clamp(24px,4vh,40px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(38px,5.2vw,64px)] leading-none font-[340] tracking-[-0.025em]">
          Your check-ins
        </h1>
        <p className="max-w-[36em] text-[clamp(17px,2.2vw,20px)] leading-[1.45] text-pretty text-ink-muted">
          Everything you’ve posted in{" "}
          <Link href="/chat/check-ins">#check-ins</Link>, newest first.
          {posts && posts.length > 0 && ` ${posts.length} so far.`}
        </p>
      </header>
      {posts === undefined ? null : posts.length === 0 ? (
        <p className="text-[18px] text-ink-muted">
          Nothing yet. Your posts in{" "}
          <Link href="/chat/check-ins">#check-ins</Link> show up here.
        </p>
      ) : (
        <ul className="flex flex-col border-t border-ink/10">
          {posts.map((p) => (
            <li
              key={p._id}
              className="flex flex-col gap-2 border-b border-ink/10 py-5"
            >
              <p className="flex flex-wrap items-baseline gap-x-3 text-[15px] text-ink-muted">
                <span className="font-semibold text-ink">
                  {fmtLongDay(p._creationTime)}
                </span>
                <span>{fmtTime(p._creationTime)} PT</span>
                <Link
                  href={`/chat/check-ins/${p._id}`}
                  className="ml-auto text-ink-muted"
                >
                  {p.replyCount > 0
                    ? `${p.replyCount} ${p.replyCount === 1 ? "reply" : "replies"}`
                    : "Open in chat"}
                </Link>
              </p>
              <div className="text-[17px] leading-[1.5]">
                <RichText body={p.body} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
