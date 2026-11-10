"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Avatar } from "@/components/portal/avatar";
import { useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import {
  DEADLINES,
  DEADLINE_LABELS,
  PROGRAM_START,
} from "@/convex/lib/program";
import { ptDayKey, ptParts, ptToUtc } from "@/convex/lib/time";

type Essay = FunctionReturnType<typeof api.essays.recap>["essays"][number];

const h2 =
  "font-display text-[clamp(26px,3vw,32px)] leading-[1.1] font-[380] tracking-[-0.015em]";
const num = (n: number) => n.toLocaleString("en-US");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Common words left out of the title word list.
const STOP = new Set(
  "a an and are as at be but by can do does for from has have how i if in into is it its it’s it's my no not of on or our so than that the their them then there these they this to too was we what when where which who why will with you your vs".split(
    " ",
  ),
);

export function Recap() {
  const params = useParams<{ week: string }>();
  const week = Number(params.week);
  const valid = Number.isInteger(week) && week >= 1 && week <= DEADLINES.length;
  const data = useQuery(api.essays.recap, valid ? { week } : "skip");
  const now = useNow(60_000);

  if (!valid)
    return <p className="p-10 text-[18px] text-ink-muted">No such week.</p>;

  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-[clamp(28px,5vh,48px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(38px,5.2vw,64px)] leading-none font-[340] tracking-[-0.025em]">
          Week {week} <em className="wonk text-brass-numeral">in review</em>
        </h1>
        <p className="max-w-[36em] text-[clamp(17px,2.2vw,20px)] leading-[1.45] text-pretty text-ink-muted">
          The essays that counted toward the {DEADLINE_LABELS[week - 1]}{" "}
          deadline.
          {now !== null && now < DEADLINES[week - 1] &&
            " This week is still open, so this will keep filling in."}
        </p>
        <nav aria-label="Weeks" className="flex gap-4 text-[16px]">
          {DEADLINES.map((d, i) =>
            i + 1 === week ? (
              <span key={d} className="font-medium">
                Week {i + 1}
              </span>
            ) : (
              <Link key={d} href={`/recap/${i + 1}`} className="text-ink-muted">
                Week {i + 1}
              </Link>
            ),
          )}
        </nav>
      </header>
      {!data ? (
        <p className="text-ink-muted">Loading…</p>
      ) : data.essays.length === 0 ? (
        <p className="text-[18px] text-ink-muted">No essays for this week yet.</p>
      ) : (
        <>
          <Stats essays={data.essays} writers={data.writers} />
          <div className="grid gap-[clamp(32px,5vh,48px)] lg:grid-cols-2">
            <Timing essays={data.essays} week={week} />
            <Lengths essays={data.essays} />
          </div>
          <TitleWords essays={data.essays} />
          <Highlights essays={data.essays} />
          <EssayList essays={data.essays} />
        </>
      )}
    </main>
  );
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

const withWords = (essays: Essay[]) =>
  essays.filter((e): e is Essay & { wordCount: number } => e.wordCount !== null);

function Stats({ essays, writers }: { essays: Essay[]; writers: number }) {
  const authors = new Set(essays.map((e) => e.author._id)).size;
  const counts = withWords(essays).map((e) => e.wordCount);
  const total = counts.reduce((a, b) => a + b, 0);
  const tiles = [
    { label: "Essays", value: num(essays.length) },
    { label: "Writers who published", value: `${authors} of ${writers}` },
    { label: "Words, about", value: counts.length ? num(total) : "–" },
    {
      label: "Typical length",
      value: counts.length ? `${num(median(counts))} words` : "–",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px bg-ink/12 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col gap-1 bg-cream p-4">
          <dt className="text-[15px] text-ink-muted">{t.label}</dt>
          <dd className="font-display text-[clamp(28px,3.4vw,40px)] leading-none font-[380] tabular-nums">
            {t.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Vertical bars with a count on hover and a label under each.
function Bars({
  bars,
  label,
}: {
  bars: { key: string; label: string; count: number; title: string }[];
  label: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-2">
      <div className="flex h-44 items-end gap-0.5 border-b border-ink/25">
        {bars.map((b) => (
          <div
            key={b.key}
            title={b.title}
            className="group relative flex h-full flex-1 flex-col justify-end"
          >
            {b.count > 0 && (
              <span className="mb-1 text-center text-[13px] text-ink-muted tabular-nums">
                {b.count}
              </span>
            )}
            <div
              className="rounded-t-[4px] bg-brass transition-colors group-hover:bg-brass-numeral"
              style={{ height: `${(b.count / max) * 80}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-0.5">
        {bars.map((b) => (
          <span
            key={b.key}
            className="flex-1 truncate text-center text-[13px] text-ink-muted"
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Timing({ essays, week }: { essays: Essay[]; week: number }) {
  const deadline = DEADLINES[week - 1];
  const start = Math.min(
    week === 1 ? PROGRAM_START : DEADLINES[week - 2],
    essays[0].submittedAt,
  );
  const s = ptParts(start);
  const lastKey = ptDayKey(deadline);
  const days: { key: string; ms: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const ms = ptToUtc(s.year, s.month, s.day + i, 12);
    const key = ptDayKey(ms);
    days.push({ key, ms });
    if (key === lastKey) break;
  }
  const byDay = new Map<string, number>();
  for (const e of essays) {
    const k = ptDayKey(e.submittedAt);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const lastDay = essays.filter(
    (e) => deadline - e.submittedAt <= 24 * 3600_000,
  ).length;
  return (
    <section aria-labelledby="timing" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="timing" className={h2}>
          When they came in
        </h2>
        <p className="text-ink-muted">
          Essays per day, Pacific time. {lastDay} of {essays.length} arrived in
          the last 24 hours before the deadline.
        </p>
      </div>
      <Bars
        label="Essays registered per day"
        bars={days.map((d) => {
          const p = ptParts(d.ms);
          const count = byDay.get(d.key) ?? 0;
          return {
            key: d.key,
            label: `${WEEKDAYS[p.weekday]} ${p.day}`,
            count,
            title: `${WEEKDAYS[p.weekday]} Nov ${p.day}: ${count} ${count === 1 ? "essay" : "essays"}`,
          };
        })}
      />
    </section>
  );
}

const BUCKETS = [
  { max: 500, label: "<500" },
  { max: 1000, label: "500–1k" },
  { max: 1500, label: "1–1.5k" },
  { max: 2000, label: "1.5–2k" },
  { max: 3000, label: "2–3k" },
  { max: 5000, label: "3–5k" },
  { max: Infinity, label: "5k+" },
];

function Lengths({ essays }: { essays: Essay[] }) {
  const counted = withWords(essays);
  const counts = BUCKETS.map(() => 0);
  for (const e of counted)
    counts[BUCKETS.findIndex((b) => e.wordCount < b.max)]++;
  return (
    <section aria-labelledby="lengths" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="lengths" className={h2}>
          How long they ran
        </h2>
        <p className="text-ink-muted">
          Essays by word count
          {counted.length < essays.length &&
            ` (${essays.length - counted.length} without a count are left out)`}
          .
        </p>
      </div>
      <Bars
        label="Essays by word count"
        bars={BUCKETS.map((b, i) => ({
          key: b.label,
          label: b.label,
          count: counts[i],
          title: `${b.label} words: ${counts[i]} ${counts[i] === 1 ? "essay" : "essays"}`,
        }))}
      />
    </section>
  );
}

function TitleWords({ essays }: { essays: Essay[] }) {
  const freq = new Map<string, number>();
  for (const e of essays) {
    const words = new Set(
      (e.title.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).filter(
        (w) => w.length > 2 && !STOP.has(w),
      ),
    );
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40);
  if (top.length === 0) return null;
  const max = top[0][1];
  // Shown alphabetically so the sizes, not the order, carry the counts.
  const shown = [...top].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <section aria-labelledby="title-words" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="title-words" className={h2}>
          Words in the titles
        </h2>
        <p className="text-ink-muted">
          Bigger words appear in more titles.
        </p>
      </div>
      <ul className="flex flex-wrap items-baseline gap-x-5 gap-y-2 bg-cream-deep p-5">
        {shown.map(([w, n]) => (
          <li
            key={w}
            title={`In ${n} ${n === 1 ? "title" : "titles"}`}
            className={`font-display leading-tight ${n === max && max > 1 ? "text-brass-text" : ""}`}
            style={{ fontSize: `${18 + (max > 1 ? ((n - 1) / (max - 1)) * 26 : 0)}px` }}
          >
            {w}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Highlights({ essays }: { essays: Essay[] }) {
  const counted = withWords(essays);
  const byLength = [...counted].sort((a, b) => b.wordCount - a.wordCount);
  const items: { label: string; essay: Essay; note: string }[] = [
    { label: "First in", essay: essays[0], note: when(essays[0].submittedAt) },
    {
      label: "Last in",
      essay: essays[essays.length - 1],
      note: when(essays[essays.length - 1].submittedAt),
    },
  ];
  if (byLength.length > 1) {
    items.push(
      {
        label: "Longest",
        essay: byLength[0],
        note: `${num(byLength[0].wordCount)} words`,
      },
      {
        label: "Shortest",
        essay: byLength[byLength.length - 1],
        note: `${num(byLength[byLength.length - 1].wordCount)} words`,
      },
    );
  }
  return (
    <section aria-labelledby="highlights" className="flex flex-col gap-4">
      <h2 id="highlights" className={h2}>
        Bookends
      </h2>
      <ul className="grid gap-px bg-ink/12 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <li key={i.label} className="flex flex-col gap-2 bg-cream p-4">
            <span className="text-[15px] text-ink-muted">{i.label}</span>
            <a
              href={i.essay.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-[20px] leading-snug"
            >
              {i.essay.title}
            </a>
            <span className="text-[15px] text-ink-muted">
              {i.essay.author.name} · {i.note}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function when(ms: number) {
  const p = ptParts(ms);
  const h = p.hour % 12 || 12;
  return `${WEEKDAYS[p.weekday]} ${h}:${String(p.minute).padStart(2, "0")}${p.hour < 12 ? "am" : "pm"} PT`;
}

function EssayList({ essays }: { essays: Essay[] }) {
  return (
    <section aria-labelledby="all-essays" className="flex flex-col gap-4">
      <h2 id="all-essays" className={h2}>
        All {essays.length} essays
      </h2>
      <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2">
        {essays.map((e) => (
          <li key={e._id} className="flex items-center gap-3 py-1.5">
            <Avatar member={e.author} size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[17px]"
              >
                {e.title}
              </a>
              <span className="truncate text-[14px] text-ink-muted">
                {e.author.name}
                {e.wordCount !== null && ` · ${num(e.wordCount)} words`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
