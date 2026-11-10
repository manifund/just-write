"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { errorText, PanelHeader } from "./event-panel";

// How members get every session into their own calendar app.
export function Subscribe({ onClose }: { onClose: () => void }) {
  const info = useQuery(api.events.calendarInfo);
  const makeFeed = useMutation(api.events.makeFeed);
  const [feed, setFeed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = feed ?? info?.feedUrl ?? null;
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
                  ? `Shared with ${info.sharedWith.join(" and ")}. Updates within a minute.`
                  : "Updates within a minute."}
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
