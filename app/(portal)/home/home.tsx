"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { usePortal } from "@/components/portal/context";
import { confetti, hostOf, timeAgo, useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEADLINES } from "@/convex/lib/program";
import { errorMessage } from "@/lib/convex";

const NUMERALS = ["i.", "ii.", "iii.", "iv."];
const eyebrow = "text-[13px] tracking-[0.14em] text-brass-text uppercase";
const h2 =
  "font-display text-[clamp(26px,3vw,32px)] leading-[1.1] font-[380] tracking-[-0.015em]";

function greeting(now: number) {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Los_Angeles",
    }).format(now),
  );
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function until(t: number, now: number) {
  const mins = Math.max(0, Math.round((t - now) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0)
    return `${d} day${d === 1 ? "" : "s"}, ${h} hr${h === 1 ? "" : "s"}`;
  if (h > 0) return `${h} hr${h === 1 ? "" : "s"}, ${m} min`;
  return `${m} min`;
}

export function Home() {
  const { me } = usePortal();
  const now = useNow();
  const mine = useQuery(api.essays.mine);
  const firstName = me.name.split(/\s+/)[0];

  const nextIdx = now === null ? -1 : DEADLINES.findIndex((d) => d > now);
  const kickoff = Date.UTC(2026, 10, 1, 7); // Nov 1, midnight PT

  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-[clamp(32px,5vh,56px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(38px,5.2vw,64px)] leading-none font-[340] tracking-[-0.025em] text-balance">
          {now ? greeting(now) : "Hello"},{" "}
          <em className="wonk text-brass-numeral">{firstName}</em>.
        </h1>
        {now !== null && (
          <p className="text-[clamp(17px,2.2vw,20px)] leading-[1.45] text-pretty text-ink-muted">
            {now < kickoff ? (
              <>
                Kickoff is <strong className="text-ink">Sunday, Nov 1</strong>,
                in {until(kickoff, now)}.
              </>
            ) : nextIdx >= 0 ? (
              <>
                Essay {NUMERALS[nextIdx].replace(".", "")} is due{" "}
                <strong className="text-ink">
                  Mon {["Nov 9", "Nov 16", "Nov 23", "Nov 30"][nextIdx]}, 9pm PT
                </strong>
                , {until(DEADLINES[nextIdx], now)} from now.
              </>
            ) : (
              <>November is over. The wrap party is Dec 2.</>
            )}
          </p>
        )}
      </header>

      <div className="grid gap-[clamp(32px,5vh,48px)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[clamp(32px,5vh,48px)]">
          <section aria-labelledby="progress" className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="progress" className={h2}>
                Your four essays
              </h2>
              {mine && (
                <span className="text-[15px] text-ink-muted tabular-nums">
                  {mine.slots.filter((s) => s.essayId).length} of 4
                </span>
              )}
            </div>
            <Slots mine={mine} now={now} />
            <RegisterEssay />
            {mine && mine.essays.length > 0 && (
              <MyEssays essays={mine.essays} />
            )}
          </section>
          <Board />
        </div>

        <div className="flex flex-col gap-[clamp(32px,5vh,48px)]">
          {SHOW_SIMILAR && <SimilarWriters />}
          <RecentEssays now={now} />
        </div>
      </div>
    </main>
  );
}

type Mine = typeof api.essays.mine._returnType;

function Slots({ mine, now }: { mine: Mine | undefined; now: number | null }) {
  const essays = new Map((mine?.essays ?? []).map((e) => [e._id as string, e]));
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(
        mine?.slots ??
        DEADLINES.map((deadline, i) => ({
          week: i + 1,
          deadline,
          label: "",
          essayId: null,
        }))
      ).map((s, i) => {
        const e = s.essayId ? essays.get(s.essayId) : null;
        const missed = !e && now !== null && now > s.deadline;
        const current =
          !e &&
          !missed &&
          now !== null &&
          DEADLINES.findIndex((d) => d > now) === i;
        return (
          <li
            key={s.week}
            className={`relative flex min-h-[148px] flex-col gap-2 p-4 transition-colors ${
              e
                ? "bg-ink text-cream"
                : current
                  ? "border-2 border-brass bg-cream-deep"
                  : "border border-ink/15 bg-cream-deep/50"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span
                className={`wonk font-display text-[30px] leading-none font-semibold ${e ? "text-brass-light" : "text-brass-numeral"}`}
              >
                {NUMERALS[i]}
              </span>
              {e && (
                <span
                  aria-label="done"
                  className="text-[18px] text-brass-light motion-safe:animate-[pop_400ms_ease-out]"
                >
                  ✓
                </span>
              )}
            </div>
            {e ? (
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-3 font-display text-[17px] leading-[1.25] font-[450] no-underline hover:underline"
              >
                {e.title}
              </a>
            ) : (
              <p
                className={`text-[15px] leading-[1.35] ${missed ? "text-brass-text" : "text-ink-muted"}`}
              >
                {missed
                  ? "Missed"
                  : current
                    ? `Due in ${until(s.deadline, now!)}`
                    : null}
              </p>
            )}
            <p
              className={`mt-auto text-[13px] tracking-[0.1em] uppercase ${e ? "text-wash-light" : "text-ink-muted"}`}
            >
              Due {["Nov 9", "Nov 16", "Nov 23", "Nov 30"][i]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

const input =
  "min-h-[46px] w-full rounded-none border border-ink/28 bg-cream px-3.5 py-2.5 font-body text-[18px] text-inherit";

function RegisterEssay() {
  const preview = useAction(api.essays.preview);
  const submit = useMutation(api.essays.submit);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [words, setWords] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedUrl, setCheckedUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function check(raw: string) {
    const u = raw.trim();
    if (!u || u === checkedUrl) return;
    setChecking(true);
    setCheckedUrl(u);
    try {
      const p = await preview({ url: u });
      if (p.title && !title) setTitle(p.title);
      setWords(p.wordCount);
    } finally {
      setChecking(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await submit({ url, title, wordCount: words });
      confetti(buttonRef.current);
      setUrl("");
      setTitle("");
      setWords(null);
      setCheckedUrl(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 bg-cream-deep p-5">
      <p className="font-display text-[21px] font-[450]">
        Register a published essay
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] tracking-[0.12em] text-ink-muted uppercase">
            Link
          </span>
          <input
            type="text"
            inputMode="url"
            required
            autoCapitalize="none"
            spellCheck={false}
            placeholder="kitwhen.substack.com/p/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={(e) => check(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              setTimeout(() => check(pasted), 0);
            }}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] tracking-[0.12em] text-ink-muted uppercase">
            Title{" "}
            {checking && (
              <span className="normal-case tracking-normal">· fetching…</span>
            )}
          </span>
          <input
            type="text"
            required
            placeholder="On writing every day"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={input}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-ink-muted" aria-live="polite">
          {words !== null &&
            (words >= 1000 ? (
              <>About {words.toLocaleString()} words.</>
            ) : (
              <>
                About {words.toLocaleString()} words. Essays need 1,000+ (this
                count is approximate).
              </>
            ))}
        </p>
        <button
          ref={buttonRef}
          type="submit"
          disabled={saving || !url.trim() || !title.trim()}
          className="min-h-[46px] cursor-pointer bg-ink px-6 text-[18px] text-cream transition-colors enabled:hover:bg-ink-muted disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? "Registering…" : "Register essay"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-base text-brass-text">
          {error}
        </p>
      )}
    </form>
  );
}

function MyEssays({ essays }: { essays: Mine["essays"] }) {
  const remove = useMutation(api.essays.remove);
  const [confirming, setConfirming] = useState<Id<"essays"> | null>(null);
  return (
    <details className="group text-[16px]">
      <summary className="cursor-pointer text-ink-muted select-none">
        All your registered essays ({essays.length})
      </summary>
      <ul className="mt-3 flex flex-col divide-y divide-ink/10">
        {essays.map((e) => (
          <li
            key={e._id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
          >
            <a
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-[600]"
            >
              {e.title}
            </a>
            <span className="text-[14px] text-ink-muted">
              {hostOf(e.url)}
              {e.wordCount ? ` · ~${e.wordCount.toLocaleString()} words` : ""}
              {e.review === "verified"
                ? " · verified ✓"
                : e.review === "rejected"
                  ? " · not counted"
                  : ""}
            </span>
            {confirming === e._id ? (
              <span className="ml-auto flex gap-3 text-[14px]">
                <button
                  type="button"
                  className="cursor-pointer text-brass-text underline"
                  onClick={() => remove({ essayId: e._id })}
                >
                  Remove it
                </button>
                <button
                  type="button"
                  className="cursor-pointer underline"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="ml-auto cursor-pointer text-[14px] text-ink-muted underline"
                onClick={() => setConfirming(e._id)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

// Similar writers is hidden for now; flip this to bring it back.
const SHOW_SIMILAR = false;

function SimilarWriters() {
  const data = useQuery(api.similar.forViewer);
  const request = useMutation(api.similar.request);
  const asked = useRef(false);

  useEffect(() => {
    if (data?.stale && !asked.current) {
      asked.current = true;
      void request();
    }
  }, [data?.stale, request]);

  const thinking = data && data.picks.length === 0 && data.stale;

  return (
    <section aria-labelledby="similar" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className={eyebrow}>Picked by Claude</p>
        <h2 id="similar" className={h2}>
          Similar writers
        </h2>
      </div>
      {data === undefined || thinking ? (
        <ul className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-[72px] bg-cream-deep/70 motion-safe:animate-pulse"
            />
          ))}
        </ul>
      ) : data.picks.length === 0 ? (
        <p className="text-[16px] leading-[1.5] text-ink-muted">
          Add a bio to your <Link href="/settings">profile</Link> and a few
          ideas to get matched with similar writers.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.picks.map((p) => (
            <li key={p.member._id}>
              <Link
                href={
                  p.member.handle ? `/members/${p.member.handle}` : "/members"
                }
                className="flex gap-3 bg-cream-deep p-3.5 no-underline transition-colors hover:bg-[#ecd5d1]"
              >
                <Avatar member={p.member} size={42} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-display text-[18px] font-[500]">
                    {p.member.name}
                  </span>
                  <span className="text-[15px] leading-[1.4] text-pretty text-ink-muted">
                    {p.reason}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentEssays({ now }: { now: number | null }) {
  const essays = useQuery(api.essays.recent, { limit: 8 });
  return (
    <section aria-labelledby="recent" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent" className={h2}>
          Recent essays
        </h2>
        <Link href="/chat/published" className="text-[15px] text-ink-muted">
          #published
        </Link>
      </div>
      {essays && essays.length === 0 && (
        <p className="text-[16px] leading-[1.5] text-ink-muted">
          No essays yet.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-ink/10">
        {essays?.map((e) => (
          <li key={e._id} className="flex gap-3 py-3">
            <Avatar member={e.author} size={32} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display text-[18px] leading-[1.25] font-[450] no-underline hover:underline"
              >
                {e.title}
              </a>
              <span className="text-[14px] text-ink-muted">
                {e.author.name} · {hostOf(e.url)}
                {now ? ` · ${timeAgo(e.submittedAt, now)}` : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Board() {
  const rows = useQuery(api.essays.board);
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      b.slots.filter((s) => s.essay).length -
        a.slots.filter((s) => s.essay).length ||
      a.member.name.localeCompare(b.member.name),
  );
  return (
    <section aria-labelledby="board" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="board" className={h2}>
          Everyone’s progress
        </h2>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-1">
        {sorted.map((r) => (
          <li key={r.member._id} className="flex items-center gap-3 py-1.5">
            <Avatar member={r.member} size={28} />
            <Link
              href={
                r.member.handle ? `/members/${r.member.handle}` : "/members"
              }
              className="min-w-0 flex-1 truncate text-[16px] no-underline hover:underline"
            >
              {r.member.name}
            </Link>
            <span
              className="flex gap-1"
              aria-label={`${r.slots.filter((s) => s.essay).length} of 4 essays`}
            >
              {r.slots.map((s) =>
                s.essay ? (
                  <a
                    key={s.week}
                    href={s.essay.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.essay.title}
                    className="size-3.5 bg-brass transition-transform hover:scale-125"
                  />
                ) : (
                  <span
                    key={s.week}
                    className="size-3.5 border border-ink/25"
                  />
                ),
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
