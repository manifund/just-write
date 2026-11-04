"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { Avatar } from "@/components/portal/avatar";
import { hostOf } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

type Row = (typeof api.members.directory._returnType)[number];

const GOAL = 4;

// Server-rendered first, then live. Sized so the whole roster fits on one screen.
export function Directory({ initial }: { initial: Row[] }) {
  const members = useQuery(api.members.directory) ?? initial;
  const published = members.reduce(
    (n, m) => n + Math.min(m.essayCount, GOAL),
    0,
  );
  return (
    <main className="mx-auto flex max-w-[80rem] flex-col gap-[clamp(24px,4vh,40px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,48px)]">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <h1 className="font-display text-[clamp(36px,4.6vw,60px)] leading-[0.95] font-[450] tracking-[-0.01em] text-balance">
          November 2026
        </h1>
        <p className="pb-1 text-[17px] text-ink-muted">
          {published} of {members.length * GOAL} essays published
        </p>
      </header>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-x-6 gap-y-2">
        {members.map((m) => (
          <li key={m._id}>
            <Link
              href={m.handle ? `/members/${m.handle}` : "#"}
              title={m.bio || undefined}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 no-underline transition-colors hover:bg-cream-deep"
            >
              <Avatar member={m} size={44} className="shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-display text-[19px] leading-tight font-[450]">
                  {m.name}
                </span>
                <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <Pips
                    filled={m.essayCount}
                    label={`${Math.min(m.essayCount, GOAL)} of ${GOAL} essays`}
                  />
                  {m.link && <span className="truncate">{hostOf(m.link)}</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Pips({ filled, label }: { filled: number; label: string }) {
  return (
    <span
      className="flex shrink-0 gap-[3px]"
      role="img"
      aria-label={label}
    >
      {Array.from({ length: GOAL }, (_, i) => (
        <span
          key={i}
          className={`size-2.5 ${i < filled ? "bg-brass" : "border border-ink/25"}`}
        />
      ))}
    </span>
  );
}
