"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/portal/avatar";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarEvent } from "@/convex/events";
import { fmtTime, fmtTimeRange, ptParts } from "@/convex/lib/time";
import type { PublicMember } from "@/convex/lib/viewer";
import { isOnline } from "./calendar";

type Response = "yes" | "maybe" | "no";
const LABELS: Record<Response, string> = {
  yes: "Going",
  maybe: "Maybe",
  no: "Can’t go",
};

const weekday = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: "America/Los_Angeles",
});
const monthLong = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "America/Los_Angeles",
});

export const errorText = (err: unknown) =>
  err instanceof ConvexError ? String(err.data) : "Something went wrong. Try again.";

function CloseButton({ onClose, className = "" }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={`flex size-12 cursor-pointer items-center justify-center text-[30px] leading-none opacity-70 transition-opacity hover:opacity-100 ${className}`}
    >
      ×
    </button>
  );
}

// Header for the editor and subscribe panels.
export function PanelHeader({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-cream py-1.5 pr-1.5 pl-6">
      <span className="font-display text-[19px] font-[430]">{label}</span>
      <CloseButton onClose={onClose} />
    </div>
  );
}

export function EventPanel({
  event: e,
  isMember,
  signedIn,
  now,
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  isMember: boolean;
  signedIn: boolean;
  now: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const deadline = e.kind === "deadline";
  const past = e.end < now;
  return (
    <article className="flex min-h-full flex-col">
      <DateLeaf event={e} onClose={onClose} />

      <div className="flex flex-col gap-8 px-7 pt-7 pb-10">
        <div className="flex flex-col gap-4">
          <h2
            className={`font-display text-[clamp(30px,3.6vw,36px)] leading-[1.08] font-[380] tracking-[-0.02em] text-balance ${
              e.canceled ? "text-ink-muted line-through decoration-1" : ""
            }`}
          >
            {e.title}
          </h2>
          {e.canceled && (
            <p className="text-[16px] font-bold text-brass-text">This session is canceled.</p>
          )}
          {e.description && (
            <p className="max-w-[34rem] text-[17px] leading-[1.55] whitespace-pre-line text-pretty">
              {e.description}
            </p>
          )}
        </div>

        {deadline ? (
          <Link
            href="/home"
            className="self-start bg-ink px-4 py-2.5 text-[16px] text-cream no-underline hover:bg-ink-muted"
          >
            Add your essay
          </Link>
        ) : (
          <dl className="flex flex-col border-t border-ink/12">
            <Row label="Where">
              <Where event={e} />
            </Row>
            {e.link && (
              <Row label="Call">
                <a href={e.link} target="_blank" rel="noopener noreferrer" className="block truncate">
                  {e.link.replace(/^https?:\/\//, "")}
                </a>
              </Row>
            )}
            <Row label={e.hosts.length > 1 ? "Hosts" : "Host"}>
              <ul className="flex flex-col gap-2">
                {e.hosts.map((h) => (
                  <li key={h._id}>
                    <Person member={h} />
                  </li>
                ))}
              </ul>
            </Row>
          </dl>
        )}

        {!deadline && !e.canceled && !past && (
          <Rsvp event={e} isMember={isMember} signedIn={signedIn} />
        )}
        {!deadline && <Guests event={e} />}
        {e.canEdit && !e.canceled && <Manage event={e} onEdit={onEdit} />}
      </div>
    </article>
  );
}

// The panel's top: the session's date, set large, in the same style as its chip on the grid.
function DateLeaf({ event: e, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const p = ptParts(e.start);
  const tone =
    e.kind === "deadline"
      ? "bg-brass/[0.13] text-brass-text"
      : isOnline(e)
        ? "bg-cream-deep text-ink"
        : "bg-ink text-cream";
  return (
    <header className={`relative px-7 pt-5 pb-7 ${tone} ${e.canceled ? "opacity-70" : ""}`}>
      {e.kind === "deadline" && (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-brass" />
      )}
      <CloseButton onClose={onClose} className="absolute top-1.5 right-1.5 z-10" />
      <p className="pr-12 text-[16px] opacity-80">{monthLong.format(e.start)}</p>
      <div className="mt-3 flex items-end gap-5">
        <span className="font-display text-[clamp(92px,11vw,120px)] leading-[0.74] font-[280] tracking-[-0.04em] tabular-nums">
          {p.day}
        </span>
        <span className="flex flex-col gap-1.5">
          <span className="font-display text-[24px] leading-none font-[420]">
            {weekday.format(e.start)}
          </span>
          <span className="text-[16px] leading-none tabular-nums opacity-80">
            {e.kind === "deadline" ? fmtTime(e.end) : fmtTimeRange(e.start, e.end)} PT
          </span>
        </span>
      </div>
    </header>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-ink/12 py-3 text-[16px]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Where({ event: e }: { event: CalendarEvent }) {
  if (e.location)
    return (
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {e.location}
      </a>
    );
  if (isOnline(e)) return <>Online</>;
  if (e.hasLocation) return <span className="text-ink-muted">Members only</span>;
  return <span className="text-ink-muted">TBD</span>;
}

function Person({ member, size = 26 }: { member: PublicMember; size?: number }) {
  const inner = (
    <>
      <Avatar member={member} size={size} />
      <span className="truncate">{member.name}</span>
    </>
  );
  const cls = "flex min-w-0 items-center gap-2.5";
  return member.handle ? (
    <Link href={`/members/${member.handle}`} className={`${cls} no-underline hover:underline`}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

function Rsvp({
  event: e,
  isMember,
  signedIn,
}: {
  event: CalendarEvent;
  isMember: boolean;
  signedIn: boolean;
}) {
  const rsvp = useMutation(api.events.rsvp).withOptimisticUpdate((store, args) => {
    const list = store.getQuery(api.events.list, {});
    if (list)
      store.setQuery(
        api.events.list,
        {},
        list.map((x) => (x._id === args.eventId ? { ...x, myRsvp: args.response } : x)),
      );
  });
  const [error, setError] = useState<string | null>(null);

  if (!isMember)
    return (
      <p className="text-[16px] text-ink-muted">
        {signedIn ? (
          "Only committed members can RSVP."
        ) : (
          <>
            <Link href={`/sign-in?next=${encodeURIComponent(`/calendar/${e.slug}`)}`}>Sign in</Link>{" "}
            to RSVP.
          </>
        )}
      </p>
    );

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="RSVP" className="grid grid-cols-3 gap-1.5">
        {(["yes", "maybe", "no"] as const).map((r) => {
          const on = e.myRsvp === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              onClick={async () => {
                setError(null);
                try {
                  await rsvp({ eventId: e._id, response: on ? null : r });
                } catch (err) {
                  setError(errorText(err));
                }
              }}
              className={`cursor-pointer border py-2.5 text-[16px] transition-colors ${
                on
                  ? "border-ink bg-ink text-cream"
                  : "border-ink/25 hover:border-ink/70"
              }`}
            >
              {LABELS[r]}
            </button>
          );
        })}
      </div>
      {(error || e.myRsvp === "yes" || e.myRsvp === "maybe") && (
        <p className={`text-[14px] ${error ? "text-brass-text" : "text-ink-muted"}`} aria-live="polite">
          {error ?? "We’ll email you a reminder the day before."}
        </p>
      )}
    </div>
  );
}

function Guests({ event: e }: { event: CalendarEvent }) {
  const { yes, maybe, no } = e.rsvps;
  if (!yes.length && !maybe.length && !no.length)
    return <p className="text-[16px] text-ink-muted">No RSVPs yet.</p>;
  return (
    <div className="flex flex-col gap-6">
      {([["yes", yes], ["maybe", maybe]] as const).map(
        ([r, people]) =>
          people.length > 0 && (
            <section key={r} className="flex flex-col gap-3">
              <h3 className="flex items-baseline gap-2">
                <span className="font-display text-[20px] font-[430]">{LABELS[r]}</span>
                <span className="text-[15px] text-ink-muted tabular-nums">{people.length}</span>
              </h3>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[15px]">
                {people.map((m) => (
                  <li key={m._id} className="min-w-0">
                    <Person member={m} size={30} />
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
      {no.length > 0 && (
        <p className="text-[15px] text-ink-muted">
          {LABELS.no}: {no.map((m) => m.name).join(", ")}
        </p>
      )}
    </div>
  );
}

// Host tools, folded away so guests and hosts see the same panel by default.
function Manage({ event: e, onEdit }: { event: CalendarEvent; onEdit: () => void }) {
  const cancel = useMutation(api.events.cancel);
  const transfer = useMutation(api.events.transfer);
  const members = useQuery(api.members.directory);
  const [confirming, setConfirming] = useState(false);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    }
  };
  const candidates = (members ?? []).filter((m) => m._id !== e.ownerId);
  const quiet =
    "cursor-pointer border border-ink/25 px-4 py-2 text-[15px] transition-colors hover:border-ink/70";

  return (
    <details className="group border-t border-ink/12 pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[16px] text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
        Manage
      </summary>
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className="cursor-pointer bg-ink px-4 py-2 text-[15px] text-cream hover:bg-ink-muted">
            Edit
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => run(() => cancel({ eventId: e._id }))}
                className="cursor-pointer bg-brass-text px-4 py-2 text-[15px] text-cream"
              >
                Cancel session
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="cursor-pointer px-3 py-2 text-[15px] underline">
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={quiet}>
              Cancel session…
            </button>
          )}
        </div>
        {confirming && (
          <p className="-mt-2 text-[14px] text-ink-muted">Everyone who RSVPed yes or maybe gets an email.</p>
        )}

        {e.canTransfer && e.kind !== "deadline" && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (to)
                void run(() => transfer({ eventId: e._id, toId: to as Id<"members"> })).then(() =>
                  setTo(""),
                );
            }}
          >
            <label htmlFor="transfer" className="text-[15px] text-ink-muted">
              Transfer to another host (you stay a co-host)
            </label>
            <div className="flex gap-2">
              <select
                id="transfer"
                value={to}
                onChange={(ev) => setTo(ev.target.value)}
                className="min-w-0 flex-1 border border-ink/25 bg-cream px-2 py-2 text-[16px]"
              >
                <option value="">Choose a member</option>
                {candidates.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={!to} className={`${quiet} disabled:cursor-default disabled:opacity-40`}>
                Transfer
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="text-[15px] text-brass-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
