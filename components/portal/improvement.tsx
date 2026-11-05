"use client";

import { useState, useTransition } from "react";
import {
  closeImprovement,
  mergeImprovement,
  revertImprovement,
} from "@/app/(portal)/improvements/actions";
import type { ImprovementCard as Card } from "@/convex/improvements";
import { useNow } from "./util";

function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Claude's reply to an @Claude request: a live checklist while it works, then the result.
export function ImprovementCard({
  card,
  isAdmin,
}: {
  card: Card;
  isAdmin: boolean;
}) {
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
        </p>
        <Steps steps={card.steps} />
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
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          <Steps steps={card.steps} />
          {card.files.length > 0 && (
            <ul className="font-mono text-[13px]">
              {card.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {card.verdict && isAdmin && <p>Decision: {card.verdict}</p>}
        </div>
      </details>
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

function Outcome({ card, isAdmin }: { card: Card; isAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: (id: string) => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await action(card._id);
      if (!r.ok) setError(r.error ?? "That didn’t work.");
    });

  const links = (
    <>
      {card.status === "pr" && card.previewUrl && (
        // Signs the member into the preview read-only (app/improvements/[id]/preview).
        <ExternalLink href={`/improvements/${card._id}/preview`}>Preview</ExternalLink>
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
      note = card.checksPassed
        ? "Waiting for an admin to review."
        : "The typecheck or linter failed, so this needs a closer look.";
      if (isAdmin)
        actions = (
          <>
            <Button primary disabled={pending} onClick={() => run(mergeImprovement)}>
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
      note = `Something went wrong. ${card.error ?? ""}`;
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
          Some of this change only works once it’s merged, so the preview may not
          show all of it.
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
