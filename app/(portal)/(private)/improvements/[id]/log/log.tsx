"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { TZ } from "@/convex/lib/time";

// The detailed log of one @Claude run, for members (convex/improvements.ts#logs). Live while
// the run is going: new events land at the end of the last loaded page, which re-sends that
// whole page, so pages stay small.
const PAGE_SIZE = 100;
// Results longer than this start folded.
const FOLD_CHARS = 400;

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: TZ,
});
const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TZ,
});

const KIND: Record<Doc<"improvementLogs">["kind"], string> = {
  step: "Step",
  text: "Said",
  tool: "Tool",
  result: "Result",
  task: "Subagent",
  shell: "Shell",
  info: "Info",
  error: "Error",
};

export function RunLog() {
  const { id } = useParams<{ id: string }>();
  const run = useQuery(api.improvements.logRun, { id });
  const paged = usePaginatedQuery(
    api.improvements.logs,
    run?.readable ? { id: run._id } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  if (run === undefined)
    return <p className="p-10 text-ink-muted">Loading…</p>;
  if (run === null)
    return <p className="p-10 text-[18px] text-ink-muted">There’s no run with this id.</p>;

  const live = run.status === "queued" || run.status === "running";
  const events = paged.results;

  return (
    <main className="mx-auto flex max-w-[64rem] flex-col gap-6 px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[36px] font-[340]">Run #{run.number} log</h1>
        <p className="text-[15px] text-ink-muted">
          {[
            run.status,
            run.startedAt && `started ${dateFmt.format(run.startedAt)} PT`,
            run.effort && `${run.effort} effort`,
            run.branch,
            live && "updating live",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="max-w-[44rem] text-[15px] whitespace-pre-line">
          {run.request.length > 600 ? `${run.request.slice(0, 600)}…` : run.request}
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
          <Link href={run.threadHref} className="underline underline-offset-2">
            Thread
          </Link>
          <Link href="/improvements" className="underline underline-offset-2">
            All runs
          </Link>
          {run.prUrl && (
            <a href={run.prUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              PR #{run.prNumber}
            </a>
          )}
          {run.previous && (
            <Link href={`/improvements/${run.previous.id}/log`} className="underline underline-offset-2">
              Previous run #{run.previous.number}
            </Link>
          )}
          {run.next && (
            <Link href={`/improvements/${run.next.id}/log`} className="underline underline-offset-2">
              Next run #{run.next.number}
            </Link>
          )}
        </nav>
        {run.error && <p className="text-[15px] text-brass-text">{run.error}</p>}
      </header>

      {!run.readable ? (
        <p className="text-[15px] text-ink-muted">
          {run.kind === "chat"
            ? "Chat task logs quote the club’s data, so only admins can see them."
            : "This log quotes #check-ins posts, so it shows once you’ve checked in today."}
        </p>
      ) : paged.status === "LoadingFirstPage" ? (
        <p className="text-ink-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-[15px] text-ink-muted">
          {live
            ? "Nothing logged yet."
            : "No log was recorded for this run. Runs before logs were added don’t have one."}
        </p>
      ) : (
        <ol className="flex flex-col border-t border-ink/15">
          {events.map((e) => (
            <Event key={e._id} event={e} />
          ))}
        </ol>
      )}
      {paged.status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => paged.loadMore(PAGE_SIZE)}
          className="w-fit cursor-pointer border border-ink/20 px-3.5 py-1 text-[14px] transition-colors hover:border-ink/50"
        >
          Show more
        </button>
      )}
      {paged.status === "LoadingMore" && <p className="text-ink-muted">Loading…</p>}
    </main>
  );
}

function Event({ event: e }: { event: Doc<"improvementLogs"> }) {
  const mono = e.kind === "tool" || e.kind === "result" || e.kind === "shell" || e.kind === "error";
  const body = mono ? (
    <pre className="font-mono text-[13px] leading-[1.45] break-words whitespace-pre-wrap">{e.text}</pre>
  ) : (
    <p className={`text-[15px] whitespace-pre-line ${e.kind === "step" ? "font-[700]" : ""}`}>{e.text}</p>
  );
  const fold = (e.kind === "result" || e.kind === "shell") && e.text.length > FOLD_CHARS;
  return (
    <li
      className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 border-b border-ink/10 py-2 sm:grid-cols-[5.5rem_6rem_minmax(0,1fr)] ${e.kind === "error" ? "text-brass-text" : ""} ${e.agent ? "bg-ink/[0.03]" : ""}`}
    >
      <span className="text-[13px] text-ink-muted tabular-nums">{timeFmt.format(e.at)}</span>
      <span className="text-[13px] text-ink-muted max-sm:col-start-2 max-sm:row-start-1 max-sm:justify-self-end">
        {KIND[e.kind]}
      </span>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 max-sm:pt-1 sm:col-span-1">
        {e.agent && <span className="text-[13px] text-ink-muted">{e.agent}</span>}
        {fold ? (
          <details>
            <summary className="w-fit cursor-pointer font-mono text-[13px] text-ink-muted select-none hover:text-ink">
              {e.text.slice(0, 120).split("\n")[0]}… ({e.text.length} characters)
            </summary>
            {body}
          </details>
        ) : (
          body
        )}
      </div>
    </li>
  );
}
