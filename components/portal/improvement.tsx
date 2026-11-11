"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  closeImprovement,
  mergeImprovement,
  revertImprovement,
} from "@/app/(portal)/(private)/improvements/actions";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ImprovementCard as Card } from "@/convex/improvements";
import { chatLinkClick } from "@/lib/chat-url";
import { addToComposer } from "./composer";
import { usePortal } from "./context";
import { RichText } from "./rich-text";
import { useNow } from "./util";

function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// The card for a chat message: it subscribes to its run itself, so progress updates re-run
// only this, not the message list (see improvements.card).
export function LiveImprovementCard({
  id,
  isAdmin,
}: {
  id: Id<"improvements">;
  isAdmin: boolean;
}) {
  const card = useQuery(api.improvements.card, { id });
  if (!card) return null;
  if (card.kind === "chat")
    return <ChatTaskCard card={card} isAdmin={isAdmin} />;
  return <ImprovementCard card={card} isAdmin={isAdmin} />;
}

// Claude's reply to a chat task (convex/chatTasks.ts): the checklist and answer, then what
// it posted, or the draft it left when it couldn't post (chatTasks.result). Its log quotes the
// club's data, so only admins get the link (improvements.ts#canReadLog).
function ChatTaskCard({ card, isAdmin }: { card: Card; isAdmin: boolean }) {
  const result = useQuery(api.chatTasks.result, { id: card._id });
  const working = card.status === "queued" || card.status === "running";
  const now = useNow(working ? 1000 : 60_000);
  const started = card.startedAt;
  const elapsed =
    started && (card.finishedAt ?? now)
      ? duration((card.finishedAt ?? now!) - started)
      : null;

  if (working)
    return (
      <div className="flex max-w-[38rem] flex-col gap-2 py-1">
        <p className="text-[15px] text-ink-muted">
          {card.waiting
            ? "Got it. I’ll start on this when the request above finishes."
            : card.status === "queued"
              ? "On it."
              : "Looking through the club’s data"}
          {elapsed && <span className="tabular-nums"> · {elapsed}</span>}
          {card.model && ` · ${card.model}`}
        </p>
        {card.untagged && <UntaggedNote />}
        <Steps steps={card.steps} />
        {card.activity && now && (
          <Activity activity={card.activity} now={now} />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 empty:hidden">
          <StopButton card={card} isAdmin={isAdmin} />
          {isAdmin && card.status === "running" && <LogLink id={card._id} />}
        </div>
      </div>
    );

  return (
    <div className="flex max-w-[38rem] flex-col gap-2.5 py-1">
      {card.summary && (
        <p className="text-[17px] leading-[1.35] whitespace-pre-line">
          {card.summary}
        </p>
      )}
      {card.status === "failed" && (
        <p className="text-[15px] text-ink-muted">
          {card.stopped
            ? card.error
            : `Something went wrong. ${card.error ?? ""}`}
        </p>
      )}
      {result &&
        (result.postId || result.postRemoved ? (
          <ChatPost post={result} />
        ) : (
          <ChatDraft draft={result} />
        ))}
      <details className="group/steps text-[14px] text-ink-muted">
        <summary className="w-fit cursor-pointer list-none select-none hover:text-ink">
          <span className="inline-block transition-transform group-open/steps:rotate-90">
            ▸
          </span>{" "}
          Chat task · {card.steps.length} steps{elapsed ? ` · ${elapsed}` : ""}
          {card.model && ` · ${card.model}`}
          {card.untagged && " · picked up without a tag"}
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          {card.untagged && <UntaggedNote />}
          <Steps steps={card.steps} />
          <p>
            I read the club’s data and don’t change the site in a chat task. For
            a change to the site, start a message with “@Claude !code”.
          </p>
          {isAdmin && card.startedAt && <LogLink id={card._id} />}
        </div>
      </details>
    </div>
  );
}

// What Claude posted for a chat task.
function ChatPost({
  post,
}: {
  post: { channelSlug: string; channelName: string; postId: string | null };
}) {
  if (!post.postId)
    return <p className="text-[15px] text-ink-muted">The post was removed.</p>;
  const href = `/chat/${post.channelSlug}/${post.postId}`;
  return (
    <div>
      <Link
        href={href}
        onClick={(e) => chatLinkClick(e, href)}
        className="inline-block border border-ink/20 px-3 py-1 text-[14px] no-underline transition-colors hover:border-ink/50"
      >
        Posted in #{post.channelName}
      </Link>
    </div>
  );
}

// A post Claude couldn't send (its channel doesn't take Claude's posts, or the day's limit
// was hit). The button puts it in the viewer's own message box there, to edit and send.
function ChatDraft({
  draft,
}: {
  draft: { channelSlug: string; channelName: string; body: string };
}) {
  const { me } = usePortal();
  const [added, setAdded] = useState(false);
  const href = `/chat/${draft.channelSlug}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="border border-ink/15 bg-cream px-3.5 py-2.5">
        <p className="pb-1 text-[13px] text-ink-muted">
          Draft for #{draft.channelName}
        </p>
        <div className="text-[17px] leading-[1.35]">
          <RichText body={draft.body} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={href}
          onClick={(e) => {
            if (!added) addToComposer(me._id, draft.channelSlug, draft.body);
            setAdded(true);
            chatLinkClick(e, href);
          }}
          className="bg-ink px-3.5 py-1 text-[14px] text-cream no-underline transition-colors hover:bg-ink-muted"
        >
          {added
            ? `Go to #${draft.channelName}`
            : `Use this draft in #${draft.channelName}`}
        </Link>
        <span className="text-[14px] text-ink-muted">
          {added
            ? "It’s in your message box there."
            : "It goes in your message box there, to edit and send."}
        </span>
      </div>
    </div>
  );
}

// Claude's reply to an @Claude request: a live checklist while it works, then the result.
export function ImprovementCard({
  card,
  isAdmin,
}: {
  card: Card;
  isAdmin: boolean;
}) {
  // /improvements lists chat tasks with this card too; their logs are admin-only.
  const showLog = card.kind !== "chat" || isAdmin;
  const working = card.status === "queued" || card.status === "running";
  const now = useNow(working ? 1000 : 60_000);
  const started = card.startedAt;
  const elapsed =
    started && (card.finishedAt ?? now)
      ? duration((card.finishedAt ?? now!) - started)
      : null;

  if (working)
    return (
      <div className="flex max-w-[38rem] flex-col gap-2 py-1">
        <p className="text-[15px] text-ink-muted">
          {card.waiting
            ? "Got it. I’ll pass this to the run above, or start on it right after."
            : card.status === "queued"
              ? "On it."
              : "Working on it"}
          {elapsed && <span className="tabular-nums"> · {elapsed}</span>}
          {card.model && ` · ${card.model}`}
        </p>
        {card.untagged && <UntaggedNote />}
        <Steps steps={card.steps} />
        {card.activity && now && (
          <Activity activity={card.activity} now={now} />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 empty:hidden">
          <StopButton card={card} isAdmin={isAdmin} />
          {card.status === "running" && showLog && <LogLink id={card._id} />}
        </div>
      </div>
    );

  return (
    <div
      className={`flex max-w-[38rem] flex-col gap-2.5 py-1 ${card.status === "superseded" ? "opacity-60" : ""}`}
    >
      {card.title && card.status !== "answered" && (
        <p className="font-[700]">{card.title}</p>
      )}
      {card.summary && (
        <p className="text-[17px] leading-[1.35] whitespace-pre-line">
          {card.summary}
        </p>
      )}
      <Outcome card={card} isAdmin={isAdmin} />
      <details className="group/steps text-[14px] text-ink-muted">
        <summary className="w-fit cursor-pointer list-none select-none hover:text-ink">
          <span className="inline-block transition-transform group-open/steps:rotate-90">
            ▸
          </span>{" "}
          {card.steps.length} steps{elapsed ? ` · ${elapsed}` : ""}
          {card.files.length > 0 &&
            ` · ${card.files.length} file${card.files.length === 1 ? "" : "s"}`}
          {card.model && ` · ${card.model}`}
          {card.untagged && " · picked up without a tag"}
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          {card.untagged && <UntaggedNote />}
          <Steps steps={card.steps} />
          {card.files.length > 0 && (
            <ul className="font-mono text-[13px]">
              {card.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {card.verdict && isAdmin && <p>Decision: {card.verdict}</p>}
          {card.startedAt && showLog && <LogLink id={card._id} />}
        </div>
      </details>
    </div>
  );
}

// A run started from a reply that didn't mention Claude (convex/untagged.ts).
function UntaggedNote() {
  return (
    <p className="text-[14px] text-ink-muted">
      This reply didn’t mention me, but it read like it was for me, so I picked
      it up. Write “@Claude !mute” to stop that in this thread.
    </p>
  );
}

// Stops a run that's going (improvements.stop). Only the member who asked and admins see it.
function StopButton({ card, isAdmin }: { card: Card; isAdmin: boolean }) {
  const { me } = usePortal();
  const stop = useMutation(api.improvements.stop);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me._id !== card.requesterId && !isAdmin) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={pending || card.stopping}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await stop({ id: card._id });
          } catch (err) {
            setError(
              err instanceof ConvexError
                ? String(err.data)
                : "That didn’t work.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {card.stopping ? "Stopping…" : "Stop"}
      </Button>
      {error && (
        <p role="alert" className="text-[14px] text-brass-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Steps({ steps }: { steps: Card["steps"] }) {
  return (
    <ol className="flex flex-col gap-1 text-[15px]">
      {steps.map((s, i) => (
        <li
          key={i}
          className={`flex items-baseline gap-2 ${s.state === "active" ? "text-ink" : s.state === "failed" ? "text-brass-text" : "text-ink-muted"}`}
        >
          <span aria-hidden="true" className="w-4 shrink-0 text-center">
            {s.state === "done" ? (
              "✓"
            ) : s.state === "failed" ? (
              "✕"
            ) : (
              <span className="inline-block size-2 rounded-full bg-brass motion-safe:animate-pulse" />
            )}
          </span>
          <span className="min-w-0 break-words">{s.label}</span>
          <span className="sr-only">
            {s.state === "active" ? "(in progress)" : `(${s.state})`}
          </span>
        </li>
      ))}
    </ol>
  );
}

// What the agent is doing between checklist lines: subagents it's waiting on, or a long tool
// call (scripts/improve-runner.ts sends this at most every ~12s; times are computed here).
const LONG_TOOL_MS = 20_000;

function Activity({
  activity,
  now,
}: {
  activity: NonNullable<Card["activity"]>;
  now: number;
}) {
  const running = activity.tasks.filter((t) => t.state === "running").length;
  const finished = activity.tasks.length - running;
  const toolFor = activity.tool ? now - activity.tool.since : 0;
  const parts: string[] = [];
  if (running) parts.push(`${running} task${running === 1 ? "" : "s"} running`);
  if (finished) parts.push(`${finished} finished`);
  if (activity.tool && toolFor > LONG_TOOL_MS)
    parts.push(
      `${activity.tool.name === "Bash" ? "running a command" : `using ${activity.tool.name}`} for ${duration(toolFor)}`,
    );
  if (parts.length === 0) return null;
  const idle = now - activity.lastAt;
  parts.push(
    idle < 5000 ? "active just now" : `last activity ${duration(idle)} ago`,
  );
  const line = parts.join(" · ");

  return (
    <div className="flex flex-col gap-0.5 text-[14px] text-ink-muted">
      <p className="tabular-nums">
        {line.charAt(0).toUpperCase() + line.slice(1)}
      </p>
      {activity.tasks.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-6">
          {activity.tasks.map((t, i) => (
            <li key={i} className="min-w-0 break-words">
              <span aria-hidden="true">
                {t.state === "running"
                  ? "· "
                  : t.state === "done"
                    ? "✓ "
                    : "✕ "}
              </span>
              {t.label}
              {t.state === "running" && t.summary ? `: ${t.summary}` : ""}
              <span className="sr-only">
                {t.state === "running" ? " (running)" : ` (${t.state})`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The run's detailed log, for members (app/(portal)/(private)/improvements/[id]/log).
function LogLink({ id }: { id: string }) {
  return (
    <Link
      href={`/improvements/${id}/log`}
      className="w-fit text-[14px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
    >
      Log
    </Link>
  );
}

function Outcome({ card, isAdmin }: { card: Card; isAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (
    action: (id: string) => Promise<{ ok: boolean; error?: string }>,
  ) =>
    start(async () => {
      setError(null);
      const r = await action(card._id);
      if (!r.ok) setError(r.error ?? "That didn’t work.");
    });

  const links = (
    <>
      {card.status === "pr" && card.previewUrl && (
        // Signs the member into the preview read-only (app/improvements/[id]/preview).
        <ExternalLink href={`/improvements/${card._id}/preview`}>
          Preview
        </ExternalLink>
      )}
      {card.prUrl && (
        <ExternalLink href={card.prUrl}>PR #{card.prNumber}</ExternalLink>
      )}
    </>
  );

  let note: React.ReactNode = null;
  let actions: React.ReactNode = null;
  switch (card.status) {
    case "pr":
      note = card.conflicts
        ? isAdmin
          ? "This conflicts with newer changes to the site. Merge has Claude fix that first."
          : "This conflicts with newer changes to the site, so it needs a sync before it can merge."
        : card.checksPassed
          ? "Waiting for an admin to review."
          : "The typecheck or linter failed, so this needs a closer look.";
      if (isAdmin)
        actions = (
          <>
            <Button
              primary
              disabled={pending}
              onClick={() => run(mergeImprovement)}
            >
              Merge
            </Button>
            <Button disabled={pending} onClick={() => run(closeImprovement)}>
              Close
            </Button>
          </>
        );
      break;
    case "merged":
      note = card.revertPrUrl ? (
        <>
          Merged. A revert is open:{" "}
          <ExternalLink href={card.revertPrUrl}>revert PR</ExternalLink>
        </>
      ) : (
        "Merged. It’ll be live on justwrite.club in a couple of minutes."
      );
      if (isAdmin && !card.revertPrUrl)
        actions = (
          <Button disabled={pending} onClick={() => run(revertImprovement)}>
            Revert
          </Button>
        );
      break;
    case "closed":
      note = "Closed without merging.";
      break;
    case "superseded":
      note = "Updated in a later reply.";
      break;
    case "failed":
      note = card.stopped
        ? `${card.error ?? "Stopped."} Reply @Claude continue to pick it up again.`
        : `Something went wrong. ${card.error ?? ""}`;
      break;
  }

  if (!note && !card.prUrl) return null;
  return (
    <div className="flex flex-col gap-2">
      {note && <p className="text-[15px] text-ink-muted">{note}</p>}
      {(card.prUrl || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {links}
          {actions}
        </div>
      )}
      {card.status === "pr" && card.touchesConvex && card.previewUrl && (
        <p className="text-[14px] text-ink-muted">
          Some of this change only works once it’s merged, so the preview may
          not show all of it.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[14px] text-brass-text">
          {error}
        </p>
      )}
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-ink/20 px-3 py-1 text-[14px] no-underline transition-colors hover:border-ink/50"
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function Button({
  primary,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`cursor-pointer px-3.5 py-1 text-[14px] transition-colors disabled:cursor-default disabled:opacity-50 ${
        primary
          ? "bg-ink text-cream enabled:hover:bg-ink-muted"
          : "border border-ink/20 enabled:hover:border-ink/50"
      }`}
    >
      {children}
    </button>
  );
}
