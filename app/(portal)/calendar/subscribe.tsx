"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { errorText, PanelHeader } from "./event-panel";

// How members get the calendar (every session, or only their own) into their calendar app.
export function Subscribe({ onClose }: { onClose: () => void }) {
  const info = useQuery(api.events.calendarInfo);
  const makeFeed = useMutation(api.events.makeFeed);
  const [feed, setFeed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mine, setMine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = feed ?? info?.feedUrl ?? null;
  const url = base && mine ? `${base}&only=mine` : base;
  const h3 = "font-display text-[21px] font-[430]";

  return (
    <div className="flex flex-col">
      <PanelHeader label="Add to your calendar" onClose={onClose} />
      <div className="flex flex-col gap-8 px-6 py-6">
        <section className="flex flex-col gap-3">
          <h3 className={h3}>Google Calendar</h3>
          {info?.googleCalendarId ? (
            <>
              <p className="text-[16px] leading-[1.5]">
                {info.sharedWith.length
                  ? `Shared with ${info.sharedWith.join(" and ")}. `
                  : ""}
                Shows every session and updates within a minute.
              </p>
              <p className="text-[15px] leading-[1.5] text-ink-muted">
                To see only your own sessions, hide this calendar and add the
                “Only mine” link below under Other calendars → From URL.
              </p>
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(info.googleCalendarId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start bg-ink px-4 py-2 text-[15px] text-cream no-underline hover:bg-ink-muted"
              >
                Open in Google Calendar
              </a>
            </>
          ) : (
            <p className="text-[16px] text-ink-muted">
              {info === undefined
                ? "Loading…"
                : "Not set up yet. Use the link below."}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={h3}>Apple Calendar, Outlook, and others</h3>
          <p className="text-[16px] leading-[1.5]">
            Subscribe with your personal link. It updates about hourly. Keep it
            private, since it includes addresses.
          </p>
          <div
            role="radiogroup"
            aria-label="Which sessions"
            className="flex self-start border border-ink/25 text-[15px]"
          >
            {[
              { value: false, label: "Everything" },
              { value: true, label: "Only mine" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={mine === o.value}
                onClick={() => {
                  setMine(o.value);
                  setCopied(false);
                }}
                className={`cursor-pointer px-4 py-2 ${
                  mine === o.value ? "bg-ink text-cream" : "hover:bg-ink/5"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[15px] leading-[1.5] text-ink-muted">
            {mine
              ? "Essay deadlines and the sessions you host or RSVP yes or maybe to."
              : "Every session on the calendar, and the essay deadlines."}
          </p>
          {url ? (
            <div className="flex flex-col gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                aria-label="Your calendar link"
                className="border border-ink/25 bg-cream-deep px-3 py-2 text-[14px]"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  }}
                  className="cursor-pointer border border-ink/25 px-4 py-2 text-[15px] hover:border-ink/60"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a
                  href={url.replace(/^https:/, "webcal:")}
                  className="border border-ink/25 px-4 py-2 text-[15px] no-underline hover:border-ink/60"
                >
                  Open in calendar app
                </a>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  setFeed(await makeFeed());
                } catch (err) {
                  setError(errorText(err));
                }
              }}
              className="cursor-pointer self-start border border-ink/25 px-4 py-2 text-[15px] hover:border-ink/60"
            >
              Get my link
            </button>
          )}
          {error && <p className="text-[15px] text-brass-text">{error}</p>}
        </section>
      </div>
    </div>
  );
}
