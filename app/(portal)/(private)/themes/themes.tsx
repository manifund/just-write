"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { usePortal } from "@/components/portal/context";
import { timeAgo, useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

type Data = FunctionReturnType<typeof api.themes.get>;
type Word = Data["cloud"][number];
type Phrase = Data["phrases"][number];

const h2 =
  "font-display text-[clamp(26px,3vw,32px)] leading-[1.1] font-[380] tracking-[-0.015em]";
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function Themes() {
  const data = useQuery(api.themes.get);
  const request = useMutation(api.themes.request);
  const refresh = useMutation(api.themes.refresh);
  const { viewer } = usePortal();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const asked = useRef(false);
  const now = useNow(60_000);

  // New essays since the last update: ask for one (the server limits it to once an hour).
  useEffect(() => {
    if (data?.stale && !data.working && !asked.current) {
      asked.current = true;
      // Read-only previews can't ask; they show what's there.
      request().catch(() => {});
    }
  }, [data?.stale, data?.working, request]);

  return (
    <main className="mx-auto flex w-full max-w-[76rem] min-w-0 flex-col gap-[clamp(28px,5vh,48px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(38px,5.2vw,64px)] leading-none font-[340] tracking-[-0.025em]">
          What we’re <em className="wonk text-brass-numeral">writing about</em>
        </h1>
        <p className="max-w-[36em] text-[clamp(17px,2.2vw,20px)] leading-[1.45] text-pretty text-ink-muted">
          Claude reads every essay registered so far. Here are the ideas that
          come up across them and the themes they fall into.
        </p>
        {data && data.total > 0 && (
          <p className="text-[15px] text-ink-muted">
            Read {Math.min(data.read, data.total)} of{" "}
            {plural(data.total, "essay")}
            {!data.stale && data.total > data.read && data.read > 0
              ? " (the rest had no text Claude could read)"
              : ""}
            {data.computedAt && now !== null
              ? ` · updated ${timeAgo(data.computedAt, now)}`
              : ""}
            {data.working && data.computedAt ? " · reading new essays now" : ""}
            {viewer.isAdmin && !data.working && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    setRefreshError(null);
                    refresh().catch((err: unknown) =>
                      setRefreshError(
                        err instanceof ConvexError
                          ? String(err.data)
                          : "Couldn’t start a refresh.",
                      ),
                    );
                  }}
                  className="cursor-pointer underline decoration-ink-muted/40 underline-offset-2 hover:text-ink"
                >
                  Refresh now
                </button>
              </>
            )}
            {refreshError && ` · ${refreshError}`}
          </p>
        )}
      </header>
      {data === undefined ? (
        <p className="text-ink-muted">Loading…</p>
      ) : data.total === 0 ? (
        <p className="text-[18px] text-ink-muted">
          No essays yet. This page fills in as people register them.
        </p>
      ) : data.cloud.length === 0 && data.themes.length === 0 ? (
        data.working || data.stale ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <div className="h-64 bg-cream-deep/70 motion-safe:animate-pulse" />
            <p className="text-ink-muted">
              Reading the essays. This takes a minute or two.
            </p>
          </div>
        ) : (
          <p className="text-[18px] text-ink-muted">
            Claude couldn’t read any of the essays’ pages yet.
          </p>
        )
      ) : (
        <>
          {data.phrases.length > 0 ? (
            <Phrases phrases={data.phrases} />
          ) : (
            data.cloud.length > 0 && <Cloud words={data.cloud} />
          )}
          {data.writerPairs.length > 0 && (
            <WriterPairs pairs={data.writerPairs} />
          )}
          {data.themes.length > 0 && (
            <ThemeCards
              themes={data.themes}
              overview={data.overview}
              total={data.total}
            />
          )}
        </>
      )}
    </main>
  );
}

// Biggest words in the middle, smaller ones toward the edges.
function centerOut(words: Word[]) {
  const out: Word[] = [];
  words.forEach((w, i) => (i % 2 ? out.push(w) : out.unshift(w)));
  return out;
}

function Cloud({ words }: { words: Word[] }) {
  const [active, setActive] = useState<Word | null>(null);
  const max = words[0].weight;
  const min = words[words.length - 1].weight;
  const scale = (w: number) =>
    max === min ? 1 : Math.sqrt((w - min) / (max - min));
  return (
    <section aria-labelledby="cloud" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="cloud" className={h2}>
          Words that come up
        </h2>
        <p className="text-ink-muted">
          Bigger words are used more, and in more essays. Common words are left
          out, and each word has to be used by at least two writers.
        </p>
      </div>
      <ul
        aria-label="Word cloud"
        className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 bg-cream-deep px-[clamp(16px,4vw,48px)] py-[clamp(20px,4vw,40px)]"
        onMouseLeave={() => setActive(null)}
      >
        {centerOut(words).map((w) => {
          const s = scale(w.weight);
          const rank = words.indexOf(w);
          return (
            <li
              key={w.word}
              tabIndex={0}
              aria-label={`${w.word}: ${plural(w.uses, "time")} in ${plural(w.essays, "essay")}`}
              onMouseEnter={() => setActive(w)}
              onFocus={() => setActive(w)}
              onClick={() => setActive(w)}
              className={`max-w-full cursor-default font-display leading-[1.15] [overflow-wrap:anywhere] transition-opacity outline-none focus-visible:underline ${
                rank < 8
                  ? "text-brass-text"
                  : rank < 30
                    ? "text-ink"
                    : "text-ink-muted"
              } ${active && active !== w ? "opacity-45" : ""}`}
              style={{
                // Cap big words on narrow screens so one word fits the width.
                fontSize: `min(${Math.round(15 + s * 45)}px, 11vw)`,
                fontWeight: Math.round(340 + s * 120),
              }}
            >
              {w.word}
            </li>
          );
        })}
      </ul>
      <p
        aria-live="polite"
        className="min-h-[1.5em] text-[15px] text-ink-muted"
      >
        {active
          ? `“${active.word}” comes up ${plural(active.uses, "time")} in ${plural(active.essays, "essay")}.`
          : "Point at or tap a word to see how often it comes up."}
      </p>
      <details className="text-[15px]">
        <summary className="cursor-pointer text-ink-muted">
          See the words as a list
        </summary>
        <ol className="mt-3 columns-[14rem] gap-x-8">
          {words.map((w) => (
            <li key={w.word} className="flex justify-between gap-3 py-0.5">
              <span className="min-w-0 [overflow-wrap:anywhere]">{w.word}</span>
              <span className="text-ink-muted tabular-nums">
                {w.uses} in {plural(w.essays, "essay")}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

// Most widely shared first: by writers, then essays.
const writersOf = (p: Phrase) =>
  new Set(p.essays.map((e) => e.author._id)).size;

function Phrases({ phrases }: { phrases: Phrase[] }) {
  const sorted = [...phrases].sort(
    (a, b) => writersOf(b) - writersOf(a) || b.essays.length - a.essays.length,
  );
  const [active, setActive] = useState<Phrase | null>(null);
  const max = sorted[0].essays.length;
  const min = sorted[sorted.length - 1].essays.length;
  const scale = (n: number) =>
    max === min ? 0.5 : Math.sqrt((n - min) / (max - min));
  return (
    <section aria-labelledby="phrases" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="phrases" className={h2}>
          Ideas that come up
        </h2>
        <p className="text-ink-muted">
          Claude’s own words for what several writers say. Bigger ones come up
          in more essays.
        </p>
      </div>
      <ul
        aria-label="Ideas that come up"
        className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-2 bg-cream-deep px-[clamp(16px,4vw,48px)] py-[clamp(20px,4vw,40px)] text-center"
      >
        {sorted.map((p, rank) => {
          const s = scale(p.essays.length);
          return (
            <li key={p.phrase} className="max-w-full">
              <button
                type="button"
                aria-pressed={active === p}
                onClick={() => setActive(active === p ? null : p)}
                className={`cursor-pointer font-display leading-[1.2] text-balance transition-opacity outline-none focus-visible:underline ${
                  rank < 5
                    ? "text-brass-text"
                    : rank < 15
                      ? "text-ink"
                      : "text-ink-muted"
                } ${active && active !== p ? "opacity-45" : ""}`}
                style={{
                  fontSize: `min(${Math.round(16 + s * 20)}px, 7vw)`,
                  fontWeight: Math.round(360 + s * 80),
                }}
              >
                {p.phrase}
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite" className="flex min-h-[1.5em] flex-col gap-3">
        {active ? (
          <>
            <p className="text-[15px] text-ink-muted">
              “{active.phrase}” comes up in{" "}
              {plural(active.essays.length, "essay")} by{" "}
              {plural(writersOf(active), "writer")}:
            </p>
            <EssayList essays={active.essays} />
          </>
        ) : (
          <p className="text-[15px] text-ink-muted">
            Tap an idea to see the essays it comes from.
          </p>
        )}
      </div>
    </section>
  );
}

function WriterPairs({ pairs }: { pairs: Data["writerPairs"] }) {
  return (
    <section aria-labelledby="talk" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="talk" className={h2}>
          These two people should talk
        </h2>
        <p className="text-ink-muted">
          Claude’s picks from everything each writer has registered: what they
          write about, their tone, and how they think.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pairs.map((p) => (
          <li
            key={p.essays.map((e) => e._id).join()}
            className="flex min-w-0 flex-col gap-3 bg-cream-deep p-5"
          >
            <div className="flex items-center gap-2">
              <span className="flex shrink-0 -space-x-2">
                {p.essays.map((e) => (
                  <span
                    key={e._id}
                    className="rounded-full ring-2 ring-cream-deep"
                  >
                    <Avatar member={e.author} size={32} />
                  </span>
                ))}
              </span>
              <h3 className="min-w-0 font-display text-[21px] leading-tight font-[420] text-balance">
                {p.essays.map((e, i) => (
                  <span key={e._id}>
                    {i > 0 && <span className="text-ink-muted"> & </span>}
                    {e.author.handle ? (
                      <Link href={`/members/${e.author.handle}`}>
                        {e.author.name}
                      </Link>
                    ) : (
                      e.author.name
                    )}
                  </span>
                ))}
              </h3>
            </div>
            <p className="text-[16px] leading-[1.45] text-pretty">{p.why}</p>
            <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-3">
              <h4 className="text-[14px] text-ink-muted">Start with</h4>
              <EssayList essays={p.essays} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ThemeCards({
  themes,
  overview,
  total,
}: {
  themes: Data["themes"];
  overview: string | null;
  total: number;
}) {
  const sorted = [...themes].sort((a, b) => b.essays.length - a.essays.length);
  return (
    <section aria-labelledby="themes" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="themes" className={h2}>
          Themes
        </h2>
        <p className="text-ink-muted">
          Claude sorted the essays into themes. An essay can be in two.
        </p>
      </div>
      {overview && (
        <p className="max-w-[40em] font-display text-[clamp(19px,2.2vw,22px)] leading-[1.45] text-pretty">
          {overview}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((t) => (
          <li
            key={t.name}
            className="flex min-w-0 flex-col gap-3 bg-cream-deep p-5"
          >
            <div className="flex flex-col gap-2">
              <h3 className="font-display text-[24px] leading-tight font-[420]">
                {t.name}
              </h3>
              <div className="flex items-center gap-3 text-[14px] text-ink-muted">
                <span className="shrink-0 tabular-nums">
                  {plural(t.essays.length, "essay")}
                </span>
                <span aria-hidden="true" className="h-1.5 flex-1 bg-ink/10">
                  <span
                    className="block h-full rounded-r-[4px] bg-brass"
                    style={{
                      width: `${Math.max(3, (t.essays.length / total) * 100)}%`,
                    }}
                  />
                </span>
              </div>
            </div>
            <p className="text-[16px] leading-[1.45] text-pretty text-ink-muted">
              {t.summary}
            </p>
            {t.pairs.length > 0 && (
              <div className="flex flex-col gap-3 border-y border-ink/10 py-3">
                <h4 className="text-[14px] text-ink-muted">Read together</h4>
                {t.pairs.map((p) => (
                  <div
                    key={p.essays.map((e) => e._id).join()}
                    className="flex flex-col gap-1.5"
                  >
                    <EssayList essays={p.essays} />
                    <p className="text-[15px] leading-[1.45] text-pretty text-ink-muted">
                      <span className="text-brass-text">
                        {p.kind === "contrast" ? "Contrast" : "Complement"}:
                      </span>{" "}
                      {p.why}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {t.pairs.length > 0 && (
              <h4 className="-mb-1 text-[14px] text-ink-muted">All essays</h4>
            )}
            <EssayList essays={t.essays} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EssayList({ essays }: { essays: Data["themes"][number]["essays"] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {essays.map((e) => (
        <li key={e._id} className="flex items-center gap-2.5">
          <Avatar member={e.author} size={22} />
          <span className="min-w-0 flex-1 truncate text-[15px]">
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {e.title}
            </a>
            <span className="text-ink-muted"> · {e.author.name}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
