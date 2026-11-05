"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CalendarEvent } from "@/convex/events";
import { fromInputs, ptDayKey, ptTimeValue } from "@/convex/lib/time";
import { errorText, PanelHeader } from "./event-panel";

const field = "min-w-0 border border-ink/25 bg-cream px-3 py-2 text-[16px] focus:border-ink";
const label = "flex flex-col gap-1.5 text-[15px]";

// Proposing a new session (no `event`) or editing one.
export function EventEditor({
  event,
  day,
  onDone,
}: {
  event?: CalendarEvent;
  day?: string;
  onDone: (key?: string) => void;
}) {
  const create = useMutation(api.events.create);
  const update = useMutation(api.events.update);
  const setCohosts = useMutation(api.events.setCohosts);
  const members = useQuery(api.members.directory);
  const me = useQuery(api.members.viewer)?.member;

  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(() =>
    event ? ptDayKey(event.start) : (day ?? ptDayKey(Date.now() + 86400_000)),
  );
  const [start, setStart] = useState(event ? ptTimeValue(event.start) : "10:00");
  const [end, setEnd] = useState(event ? ptTimeValue(event.end) : "12:00");
  const [location, setLocation] = useState(event?.location ?? "");
  const [link, setLink] = useState(event?.link ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const ownerId = event?.ownerId ?? me?._id;
  const [cohosts, setCohostIds] = useState<Id<"members">[]>(
    event ? event.hosts.map((h) => h._id).filter((id) => id !== event.ownerId) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const deadline = event?.kind === "deadline";

  const byId = new Map((members ?? []).map((m) => [m._id, m]));
  const addable = (members ?? []).filter(
    (m) => m._id !== ownerId && !cohosts.includes(m._id),
  );

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    const startMs = fromInputs(date, start);
    // An end time earlier than the start means the session runs past midnight.
    let endMs = fromInputs(date, end);
    if (endMs <= startMs) endMs += 86400_000;
    const fields = { title, description, location, link, start: startMs, end: endMs };
    setSaving(true);
    try {
      if (event) {
        await update({ eventId: event._id, ...fields });
        const before = event.hosts.map((h) => h._id).filter((id) => id !== event.ownerId);
        if (before.join() !== cohosts.join())
          await setCohosts({ eventId: event._id, cohostIds: cohosts });
        onDone(event.slug);
      } else {
        onDone(await create({ ...fields, cohostIds: cohosts }));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col">
      <PanelHeader
        label={event ? "Edit session" : "Propose a session"}
        onClose={() => onDone(event?.slug)}
      />
      <div className="flex flex-col gap-5 px-6 py-6">
        {!event && (
          <p className="text-[16px] leading-[1.45] text-ink-muted">
            You’ll host it. It’s also posted in #meetups.
          </p>
        )}
        <label className={label}>
          Title
          <input
            className={`${field} font-display text-[20px]`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday writing sprint"
            maxLength={120}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <label className={`${label} col-span-2 sm:col-span-1`}>
            Date
            <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className={label}>
            Starts
            <input type="time" step={900} className={field} value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className={label}>
            Ends
            <input type="time" step={900} className={field} value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        <p className="-mt-3 text-[14px] text-ink-muted">Pacific time</p>
        {!deadline && (
          <>
            <label className={label}>
              Where
              <input
                className={field}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Address, or leave blank for TBD"
                maxLength={200}
              />
              <span className="text-[14px] text-ink-muted">Only members see this.</span>
            </label>
            <label className={label}>
              Call link
              <input
                className={field}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="For online sessions"
                inputMode="url"
              />
            </label>
          </>
        )}
        <label className={label}>
          Description
          <textarea
            className={`${field} min-h-28 leading-[1.45]`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            maxLength={2000}
          />
        </label>

        {!deadline && (
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-1.5 text-[15px]">Co-hosts</legend>
            <p className="text-[14px] text-ink-muted">Co-hosts can edit the session.</p>
            {cohosts.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {cohosts.map((id) => {
                  const m = byId.get(id);
                  return (
                    <li key={id} className="flex items-center gap-1.5 border border-ink/20 py-1 pr-1 pl-1.5 text-[15px]">
                      <Avatar member={m ?? null} size={22} />
                      {m?.name ?? "Member"}
                      <button
                        type="button"
                        aria-label={`Remove ${m?.name ?? "co-host"}`}
                        onClick={() => setCohostIds((c) => c.filter((x) => x !== id))}
                        className="flex size-6 cursor-pointer items-center justify-center text-ink-muted hover:text-ink"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <select
              aria-label="Add a co-host"
              value=""
              onChange={(e) =>
                e.target.value && setCohostIds((c) => [...c, e.target.value as Id<"members">])
              }
              className={field}
            >
              <option value="">Add a co-host</option>
              {addable.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </fieldset>
        )}

        {error && (
          <p className="text-[15px] text-brass-text" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer bg-ink px-5 py-2.5 text-[16px] text-cream hover:bg-ink-muted disabled:opacity-50"
          >
            {event ? "Save changes" : "Add to calendar"}
          </button>
          <button type="button" onClick={() => onDone(event?.slug)} className="cursor-pointer px-2 py-2.5 text-[16px] underline">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
