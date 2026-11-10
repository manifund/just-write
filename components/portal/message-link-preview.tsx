"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { RichNode } from "@/convex/lib/richtext";
import { chatLinkClick } from "@/lib/chat-url";
import { Avatar } from "./avatar";
import { useMember } from "./context";

const SITE_HOSTS = new Set(["justwrite.club", "www.justwrite.club"]);
const MAX_PREVIEWS = 3;

// Previews of the chat messages a message links to (copied message links look like
// /chat/<channel>/<post>, plus ?message=<reply> for a reply in a thread).
export function MessageLinkPreviews({ body }: { body: string }) {
  const links = messageLinks(body);
  if (!links.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {links.map((l) => (
        <MessageLinkPreview key={l.messageId} {...l} />
      ))}
    </div>
  );
}

function MessageLinkPreview({
  messageId,
  href,
}: {
  messageId: string;
  href: string;
}) {
  const p = useQuery(api.chat.linkPreview, { messageId });
  const author = useMember(p?.authorId);
  if (p === undefined) return null;
  if (p === null) {
    return (
      <p className="max-w-[34rem] border-l-4 border-ink/15 bg-cream-deep px-4 py-2 text-[14px] text-ink-muted">
        This message was deleted.
      </p>
    );
  }
  return (
    <Link
      href={href}
      onClick={(e) => chatLinkClick(e, href)}
      className="flex max-w-[34rem] flex-col gap-1 border-l-4 border-ink/25 bg-cream-deep px-4 py-2.5 no-underline transition-colors hover:bg-cream-hover"
    >
      <span className="flex items-center gap-2 text-[14px]">
        <Avatar member={author} size={20} />
        <span className="font-[700]">{author?.name ?? "Someone"}</span>
        <span className="text-ink-muted">
          {p.inThread ? "in a thread in " : "in "}#{p.channelName} ·{" "}
          {new Date(p._creationTime).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </span>
      {p.text && (
        <span
          className={`line-clamp-4 text-[16px] leading-[1.35] ${p.hidden ? "text-ink-muted/80" : ""}`}
        >
          {p.text}
        </span>
      )}
      {p.hidden && (
        <span className="text-[12px] tracking-[0.1em] text-ink-muted uppercase">
          hidden until you’ve checked in
        </span>
      )}
    </Link>
  );
}

// Message links in a Tiptap document, deduplicated, at most MAX_PREVIEWS.
function messageLinks(body: string): { messageId: string; href: string }[] {
  let doc: RichNode;
  try {
    doc = JSON.parse(body);
  } catch {
    return [];
  }
  const found = new Map<string, string>();
  const walk = (n: RichNode) => {
    for (const m of n.marks ?? []) {
      if (m.type !== "link") continue;
      const link = parseMessageLink(String(m.attrs?.href ?? ""));
      if (link && !found.has(link.messageId))
        found.set(link.messageId, link.href);
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc);
  return [...found]
    .slice(0, MAX_PREVIEWS)
    .map(([messageId, href]) => ({ messageId, href }));
}

function parseMessageLink(
  href: string,
): { messageId: string; href: string } | null {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!SITE_HOSTS.has(url.hostname) && url.host !== window.location.host)
    return null;
  const match = url.pathname.match(/^\/chat\/[^/]+\/([^/]+)\/?$/);
  if (!match) return null;
  return {
    messageId: url.searchParams.get("message") ?? match[1],
    href: url.pathname + url.search,
  };
}
