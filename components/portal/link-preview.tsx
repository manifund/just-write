"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { messageUrls } from "@/convex/lib/linkMeta";
import { useMember } from "./context";
import { hostOf, PENDING } from "./util";

type Preview = FunctionReturnType<typeof api.linkPreviews.get>[number];

// Cards for the outside links in a message, like the ones social sites show: the page's
// title, description, and image. Links to members' essays get the essay card.
// The author (or an admin) can remove a card with its ×; the link stays in the text.
export function LinkPreviews({
  messageId,
  body,
  hidden,
  canHide,
}: {
  messageId: string;
  body: string;
  hidden?: string[];
  canHide?: boolean;
}) {
  const hidePreview = useMutation(api.chat.hidePreview);
  const [removed, setRemoved] = useState<string[]>([]);
  const gone = [...(hidden ?? []), ...removed];
  const urls = messageUrls(body).filter((u) => !gone.includes(u));
  const previews = usePreviews(messageId, urls, body);
  const shown =
    previews?.filter((p) => (p.essay || p.card) && !gone.includes(p.url)) ??
    [];
  if (!shown.length) return null;
  const inRow = shown.length > 1;
  const onHide = (url: string) =>
    canHide
      ? () => {
          // Hidden right away; it comes back if the save fails.
          setRemoved((r) => [...r, url]);
          hidePreview({ messageId: messageId as Id<"messages">, url }).catch(
            () => setRemoved((r) => r.filter((u) => u !== url)),
          );
        }
      : undefined;
  const cards = shown.map((p) =>
    p.essay ? (
      <EssayLinkCard
        key={p.url}
        preview={p}
        inRow={inRow}
        onHide={onHide(p.url)}
      />
    ) : (
      <LinkCard key={p.url} preview={p} inRow={inRow} onHide={onHide(p.url)} />
    ),
  );
  return inRow ? (
    <CardRow>{cards}</CardRow>
  ) : (
    <div className="mt-1.5">{cards}</div>
  );
}

// Several cards sit side by side and scroll sideways when they don't fit, with arrows
// and soft edges showing there's more.
function CardRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) =>
      e.left === left && e.right === right ? e : { left, right },
    );
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [measure]);
  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (el)
      el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const fade = 24;
  const mask = `linear-gradient(to right, ${edges.left ? "transparent" : "#000"}, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edges.right ? "transparent" : "#000"})`;
  return (
    <div className="group/row relative mt-1.5 max-w-[42rem]">
      <div
        ref={ref}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="flex snap-x snap-mandatory scroll-px-0 gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <RowArrow dir={-1} show={edges.left} onClick={() => go(-1)} />
      <RowArrow dir={1} show={edges.right} onClick={() => go(1)} />
    </div>
  );
}

function RowArrow({
  dir,
  show,
  onClick,
}: {
  dir: 1 | -1;
  show: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      aria-label={dir < 0 ? "Previous links" : "Next links"}
      className={`absolute top-1/2 ${dir < 0 ? "left-1" : "right-1"} flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-cream text-[15px] leading-none text-ink shadow-sm transition-[opacity,transform,background-color] duration-200 hover:bg-cream-hover active:scale-95 ${show ? "opacity-90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 focus-visible:opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {dir < 0 ? "‹" : "›"}
    </button>
  );
}

// The card on an essay's "published an essay" post in #published.
export function EssayCard({
  messageId,
  essay,
}: {
  messageId: string;
  essay: {
    title: string;
    url: string;
    wordCount: number | null;
    themes: string[];
    summary: string | null;
  };
}) {
  const [p] = usePreviews(messageId, [essay.url], essay.url) ?? [];
  return (
    <CardFrame
      href={essay.url}
      accent="border-brass"
      image={p?.card?.image}
      kicker={p?.card?.siteName ?? hostOf(essay.url)}
      title={essay.title}
      description={essay.summary ?? p?.card?.description}
      meta={essayMeta(essay.wordCount)}
      themes={essay.themes}
    />
  );
}

function EssayLinkCard({
  preview: p,
  inRow,
  onHide,
}: {
  preview: Preview;
  inRow?: boolean;
  onHide?: () => void;
}) {
  const essay = p.essay!;
  const author = useMember(essay.authorId);
  return (
    <CardFrame
      href={p.url}
      accent="border-brass"
      image={p.card?.image}
      kicker={`Essay${author ? ` by ${author.name}` : ""}`}
      title={essay.title}
      description={essay.summary ?? p.card?.description}
      meta={[hostOf(p.url), essayMeta(essay.wordCount)]
        .filter(Boolean)
        .join(" · ")}
      themes={essay.themes}
      inRow={inRow}
      onHide={onHide}
    />
  );
}

function LinkCard({
  preview: p,
  inRow,
  onHide,
}: {
  preview: Preview;
  inRow?: boolean;
  onHide?: () => void;
}) {
  const card = p.card!;
  return (
    <CardFrame
      href={p.url}
      accent="border-ink/25"
      image={card.image}
      kicker={card.siteName ?? hostOf(p.url)}
      title={card.title}
      description={card.description}
      compact
      inRow={inRow}
      onHide={onHide}
    />
  );
}

function essayMeta(words: number | null) {
  if (!words) return "";
  const minutes = Math.max(1, Math.round(words / 240));
  return `~${words.toLocaleString()} words · ${minutes} min read`;
}

function CardFrame({
  href,
  accent,
  image,
  kicker,
  title,
  description,
  meta,
  themes,
  compact,
  inRow,
  onHide,
}: {
  href: string;
  accent: string;
  image?: string | null;
  kicker: string;
  title?: string | null;
  description?: string | null;
  meta?: string;
  themes?: string[];
  compact?: boolean;
  inRow?: boolean;
  onHide?: () => void;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = image && broken !== image;
  return (
    <div
      className={`group/card relative flex flex-col border-l-[3px] ${accent} bg-cream-deep ${inRow ? "w-60 shrink-0 snap-start" : "max-w-[22rem]"}`}
    >
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label="Remove preview"
          title="Remove preview"
          className="absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded-full border border-ink/15 bg-cream text-[15px] leading-none text-ink-muted shadow-sm transition-[opacity,background-color] duration-150 hover:bg-cream-hover hover:text-ink focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100"
        >
          ×
        </button>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="flex flex-1 flex-col no-underline transition-colors duration-150 hover:bg-cream-hover"
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- page images from any host
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(image)}
            className={`block w-full object-cover ${inRow ? "max-h-32" : compact ? "max-h-32" : "max-h-40"} aspect-[1.91/1]`}
          />
        )}
        <span className="flex flex-col gap-0.5 px-2.5 py-2">
          <span className="truncate text-[10.5px] tracking-[0.1em] text-ink-muted uppercase">
            {kicker}
          </span>
          {title && (
            <span
              className={`font-display leading-[1.2] font-[450] text-pretty ${inRow ? "line-clamp-2 " : ""}${compact ? "text-[14px]" : "text-[16px]"}`}
            >
              {title}
            </span>
          )}
          {description && (
            <span
              className={`text-[12.5px] leading-[1.35] text-ink-muted ${compact || inRow ? "line-clamp-2" : "line-clamp-3"}`}
            >
              {description}
            </span>
          )}
          {meta && <span className="text-[11.5px] text-ink-muted">{meta}</span>}
        </span>
      </a>
      {!!themes?.length && <ThemeTags themes={themes} />}
    </div>
  );
}

function ThemeTags({ themes }: { themes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 px-2.5 pb-2">
      {themes.map((t) => (
        <Link
          key={t}
          href="/themes"
          className="border border-ink/20 px-1.5 py-px text-[11.5px] text-ink-muted no-underline transition-colors hover:bg-cream-hover"
        >
          {t}
        </Link>
      ))}
    </div>
  );
}

// Reads the saved cards for some URLs, and asks the server to fetch any it doesn't have
// yet (once per message and body).
function usePreviews(messageId: string, urls: string[], key: string) {
  const pending = messageId.startsWith(PENDING);
  const previews = useQuery(
    api.linkPreviews.get,
    urls.length && !pending ? { urls } : "skip",
  );
  const request = useMutation(api.linkPreviews.request);
  const asked = useRef<string | null>(null);
  const missing = !!previews?.some((p) => p.needsFetch);
  useEffect(() => {
    if (!missing || pending || asked.current === key) return;
    asked.current = key;
    request({ messageId: messageId as Id<"messages"> }).catch(() => {});
  }, [missing, pending, key, messageId, request]);
  return previews;
}
