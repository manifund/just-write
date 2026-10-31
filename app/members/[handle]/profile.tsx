"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { Avatar } from "@/components/portal/avatar";
import { hostOf } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillSlots } from "@/convex/lib/program";

type Data = NonNullable<typeof api.members.profile._returnType>;
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const h2 = "font-display text-[clamp(24px,2.8vw,30px)] leading-[1.1] font-[380] tracking-[-0.015em]";

export function Profile({ handle, initial }: { handle: string; initial: Data }) {
  const live = useQuery(api.members.profile, { handle });
  const data = live ?? initial;
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.members.viewer, isAuthenticated ? {} : "skip");
  const { member, essays } = data;
  const isSelf = viewer?.member?._id === member._id;
  const done = fillSlots(essays.map((e) => ({ ...e, review: "pending" }))).filter((s) => s.essayId).length;

  return (
    <main className="mx-auto flex max-w-[52rem] flex-col gap-[clamp(28px,5vh,44px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-wrap items-center gap-6">
        <Avatar member={member} size={104} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="font-display text-[clamp(36px,5vw,56px)] leading-none font-[340] tracking-[-0.025em] text-balance">
            {member.name}
          </h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[16px] text-ink-muted">
            {member.link && (
              <a href={member.link} target="_blank" rel="noopener noreferrer nofollow">
                {hostOf(member.link)}
              </a>
            )}
            <span>{done} of 4 essays on time</span>
            {isSelf && <Link href="/settings">Edit profile</Link>}
          </p>
        </div>
      </header>

      {member.bio && <p className="text-[clamp(18px,2.2vw,21px)] leading-[1.55] text-pretty whitespace-pre-line">{member.bio}</p>}

      <section aria-labelledby="essays" className="flex flex-col gap-3">
        <h2 id="essays" className={h2}>
          Essays
        </h2>
        {essays.length === 0 ? (
          <p className="text-[17px] text-ink-muted">No essays yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-ink/10">
            {essays.map((e) => (
              <li key={e._id} className="flex flex-col gap-0.5 py-3">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-display text-[21px] leading-[1.25] font-[450] no-underline hover:underline">
                  {e.title}
                </a>
                <span className="text-[14px] text-ink-muted">
                  {hostOf(e.url)} · {dateFmt.format(e.submittedAt)}
                  {e.wordCount ? ` · ~${e.wordCount.toLocaleString()} words` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {viewer?.canEnter && <MemberIdeas memberId={member._id} isSelf={isSelf} />}
    </main>
  );
}

function MemberIdeas({ memberId, isSelf }: { memberId: Id<"members">; isSelf: boolean }) {
  const ideas = useQuery(api.ideas.forMember, { memberId });
  const vote = useMutation(api.ideas.toggleVote);
  if (!ideas || ideas.length === 0) return null;
  return (
    <section aria-labelledby="ideas" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="ideas" className={h2}>
          Ideas
        </h2>
        <span className="text-[14px] text-ink-muted">Members only</span>
      </div>
      <ul className="flex flex-col gap-3">
        {ideas.map((i) => (
          <li key={i._id} className="flex items-start gap-4 bg-cream-deep p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-display text-[19px] leading-[1.25] font-[450]">{i.title}</p>
              {i.notes && <p className="text-[15px] leading-[1.45] whitespace-pre-line text-ink-muted">{i.notes}</p>}
            </div>
            <button
              type="button"
              disabled={isSelf}
              aria-pressed={i.voted}
              onClick={() => vote({ ideaId: i._id })}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[14px] tabular-nums disabled:cursor-default ${
                i.voted ? "border-brass bg-brass/15 text-brass-text" : "border-ink/20 enabled:hover:border-ink/50"
              }`}
            >
              {i.voted ? "★" : "☆"} {isSelf ? i.votes : `I’d read this${i.votes ? ` · ${i.votes}` : ""}`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
