"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Avatar } from "@/components/portal/avatar";
import { hostOf } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

type Row = (typeof api.members.directory._returnType)[number];

// Server-rendered first, then live.
export function Directory({ initial }: { initial: Row[] }) {
  const members = useQuery(api.members.directory) ?? initial;
  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-[clamp(28px,5vh,48px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <p className="text-[13px] tracking-[0.14em] text-brass-text uppercase">
          Nov 2026 · {members.length} writers
        </p>
      </header>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
        {members.map((m) => (
          <li key={m._id}>
            <Link
              href={m.handle ? `/members/${m.handle}` : "#"}
              className="flex h-full flex-col gap-3 border border-ink/12 bg-cream p-5 no-underline transition-[border-color,transform] hover:-translate-y-0.5 hover:border-ink/40"
            >
              <div className="flex items-center gap-3.5">
                <Avatar member={m} size={52} />
                <div className="flex min-w-0 flex-col">
                  <span className="font-display text-[21px] leading-tight font-[450]">
                    {m.name}
                  </span>
                  {m.link && (
                    <span className="truncate text-[14px] text-ink-muted">
                      {hostOf(m.link)}
                    </span>
                  )}
                </div>
              </div>
              {m.bio && (
                <p className="line-clamp-3 text-[15px] leading-[1.45] text-pretty text-ink-muted">
                  {m.bio}
                </p>
              )}
              <div className="mt-auto flex items-center gap-2.5 pt-1">
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`size-3 ${i < m.essayCount ? "bg-brass" : "border border-ink/25"}`}
                    />
                  ))}
                </span>
                <span className="truncate text-[14px] text-ink-muted">
                  {m.latestEssay
                    ? `Latest: ${m.latestEssay.title}`
                    : "No essays yet"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
