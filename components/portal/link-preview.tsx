"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { messageUrls } from "@/convex/lib/linkMeta";
import { useMember } from "./context";
import { hostOf, PENDING } from "./util";

type Preview = FunctionReturnType<typeof api.linkPreviews.get>[number];

// Cards for the outside links in a message, like the ones social sites show: the page's
// title, description, and image. Links to members' essays get the essay card.
// The author can remove any of them with the "x" on the card.
export function LinkPreviews({
  messageId,
  body,
  hidden,
  canRemove,
}: {
  messageId: string;
  body: string;
  hidden?: string[];
  canRemove?: boolean;
}) {
  const hide = useMutation(api.chat.hidePreview);
  const [removed, setRemoved] = useState<string[]>([]);
  const off = [...(hidden ?? []), ...removed];
  const urls = messageUrls(body).filter((u) => !off.includes(u));
  const previews = usePreviews(messageId, urls, body);
  const shown = previews?.filter((p) => !off.includes(p.url));
  if (!shown?.length) return null;
  const onRemove =
    canRemove && !messageId.startsWith(PENDING)
      ? (url: string) => {
          setRemoved((r) => [...r, url]);
          hide({ messageId: messageId as Id<"messages">, url }).catch(() =>
            setRemoved((r) => r.filter((u) => u !== url)),
          );
        }
      : undefined;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {shown.map((p) =>
        p.essay ? (
          <EssayLinkCard
            key={p.url}
            preview={p}
            onRemove={onRemove && (() => onRemove(p.url))}
          />
        ) : p.card ? (
          <LinkCard
            key={p.url}
            preview={p}
            onRemove={onRemove && (() => onRemove(p.url))}
          />
        ) : null,
      )}
    </div>
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
  onRemove,
}: {
  preview: Preview;
  onRemove?: () => void;
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
      onRemove={onRemove}
    />
  );
}

function LinkCard({
  preview: p,
  onRemove,
}: {
  preview: Preview;
  onRemove?: () => void;
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
      onRemove={onRemove}
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
  onRemove,
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
  onRemove?: () => void;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = image && broken !== image;
  return (
    <div
      className={`group relative flex max-w-[25.5rem] flex-col border-l-[3px] ${accent} bg-cream-deep`}
    >
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove preview"
          title="Remove preview"
          className="absolute top-1 right-1 z-10 flex size-6 items-center justify-center bg-cream-deep/90 text-[16px] leading-none text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          ×
        </button>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="flex flex-col no-underline transition-colors hover:bg-cream-hover"
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- page images from any host
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(image)}
            className={`block w-full object-cover ${compact ? "max-h-36" : "max-h-48"} aspect-[1.91/1]`}
          />
        )}
        <span className="flex flex-col gap-0.5 px-3 py-2">
          <span className="text-[11px] tracking-[0.1em] text-ink-muted uppercase">
            {kicker}
          </span>
          {title && (
            <span
              className={`font-display leading-[1.2] font-[450] text-pretty ${compact ? "text-[15px]" : "text-[17px]"}`}
            >
              {title}
            </span>
          )}
          {description && (
            <span
              className={`text-[13px] leading-[1.35] text-ink-muted ${compact ? "line-clamp-2" : "line-clamp-3"}`}
            >
              {description}
            </span>
          )}
          {meta && <span className="text-[12px] text-ink-muted">{meta}</span>}
        </span>
      </a>
      {!!themes?.length && <ThemeTags themes={themes} />}
    </div>
  );
}

function ThemeTags({ themes }: { themes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2">
      {themes.map((t) => (
        <Link
          key={t}
          href="/themes"
          className="border border-ink/20 px-1.5 py-0.5 text-[12px] text-ink-muted no-underline transition-colors hover:bg-cream-hover"
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
