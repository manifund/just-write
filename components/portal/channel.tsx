"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/convex/chat";
import { errorMessage } from "@/lib/convex";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { usePortal } from "./context";
import { Message } from "./message";
import { useRoom } from "./presence";
import { dayLabel, useNow } from "./util";

const GROUP_MS = 5 * 60 * 1000;

export function Channel({ slug }: { slug: string }) {
  const channel = useQuery(api.chat.channel, { slug });
  const [threadId, setThreadId] = useState<Id<"messages"> | null>(null);
  const here = useRoom(`channel:${slug}`);

  if (channel === undefined) return <div className="h-full" aria-busy="true" />;
  if (channel === null) {
    return <p className="p-10 text-[18px] text-ink-muted">That channel doesn’t exist.</p>;
  }

  return (
    <div className="flex h-full min-h-0">
      <title>{`#${channel.name} · Just Write`}</title>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-ink/10 px-[clamp(16px,3vw,32px)] py-3.5">
          <div className="flex min-w-0 flex-col">
            <h1 className="font-display text-[24px] leading-tight font-[450]">
              <span className="text-brass-numeral">#</span> {channel.name}
            </h1>
            <p className="truncate text-[15px] text-ink-muted">{channel.description}</p>
          </div>
          {here.length > 0 && (
            <div className="ml-auto flex shrink-0 items-center gap-2" title={here.map((m) => m.name).join(", ")}>
              <span className="flex -space-x-2">
                {here.slice(0, 5).map((m) => (
                  <Avatar key={m._id} member={m} size={28} className="rounded-full ring-2 ring-cream" />
                ))}
              </span>
              <span className="hidden text-[14px] text-ink-muted sm:inline">{here.length} here</span>
            </div>
          )}
        </header>
        <MessageList key={slug} slug={slug} onOpenThread={setThreadId} />
      </div>
      {threadId && <Thread key={threadId} slug={slug} parentId={threadId} onClose={() => setThreadId(null)} />}
    </div>
  );
}

function useTyping(slug: string, parentId?: Id<"messages">) {
  const setTyping = useMutation(api.chat.setTyping);
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < 3000) return;
    last.current = now;
    void setTyping({ slug, parentId }).catch(() => {});
  }, [setTyping, slug, parentId]);
}

function TypingIndicator({ slug, parentId }: { slug: string; parentId: Id<"messages"> | null }) {
  const rows = useQuery(api.chat.typing, { slug });
  const { roster } = usePortal();
  const now = useNow(1000);
  const names = (rows ?? [])
    .filter((r) => r.parentId === parentId && now !== null && r.expiresAt > now)
    .map((r) => roster.get(r.memberId)?.name.split(" ")[0] ?? "Someone");
  return (
    <p className="h-6 px-1 text-[14px] text-ink-muted" aria-live="polite">
      {names.length > 0 && (
        <>
          <span className="mr-1.5 inline-flex gap-0.5 align-middle" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 rounded-full bg-ink-muted motion-safe:animate-bounce"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
          {names.length === 1
            ? `${names[0]} is typing…`
            : names.length === 2
              ? `${names[0]} and ${names[1]} are typing…`
              : "Several people are typing…"}
        </>
      )}
    </p>
  );
}

function MessageList({ slug, onOpenThread }: { slug: string; onOpenThread: (id: Id<"messages">) => void }) {
  const { results, status, loadMore } = usePaginatedQuery(api.chat.messages, { slug }, { initialNumItems: 50 });
  const send = useMutation(api.chat.send);
  const markRead = useMutation(api.chat.markRead);
  const onTyping = useTyping(slug);
  const now = useNow();
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const messages = [...results].reverse();
  const newest = results[0]?._id;

  // Stick to the bottom as messages arrive (if you were already there),
  // and keep your place when older messages load above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [results]);

  useEffect(() => {
    if (newest && document.visibilityState === "visible") void markRead({ slug });
  }, [newest, slug, markRead]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 200 && status === "CanLoadMore") {
      prevHeight.current = el.scrollHeight;
      loadMore(50);
    }
  }

  return (
    <>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {/* Anchors a short conversation to the bottom, next to the composer. */}
        <div className="flex min-h-full flex-col justify-end pb-2">
          {status === "Exhausted" && <ChannelStart slug={slug} empty={messages.length === 0} />}
          {status === "LoadingMore" && <p className="py-3 text-center text-[14px] text-ink-muted">Loading earlier messages…</p>}
          <MessageRun messages={messages} now={now} onOpenThread={onOpenThread} />
        </div>
      </div>
      <div className="px-[clamp(16px,3vw,32px)] pb-[max(12px,env(safe-area-inset-bottom))]">
        <TypingIndicator slug={slug} parentId={null} />
        <Composer
          placeholder={`Message #${slug}`}
          onTyping={onTyping}
          onSend={async (body) => {
            setError(null);
            atBottom.current = true;
            try {
              await send({ slug, body });
            } catch (err) {
              setError(errorMessage(err));
              throw err;
            }
          }}
        />
        {error && (
          <p role="alert" className="pt-1 text-[14px] text-brass-text">
            {error}
          </p>
        )}
      </div>
    </>
  );
}

// Messages with day dividers, collapsing runs from the same author.
function MessageRun({
  messages,
  now,
  onOpenThread,
  inThread,
}: {
  messages: ChatMessage[];
  now: number | null;
  onOpenThread?: (id: Id<"messages">) => void;
  inThread?: boolean;
}) {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || new Date(prev._creationTime).toDateString() !== new Date(m._creationTime).toDateString();
    const compact =
      !!prev && !newDay && prev.authorId === m.authorId && !prev.essay && !m.essay && m._creationTime - prev._creationTime < GROUP_MS;
    return (
      <div key={m._id}>
        {newDay && now !== null && (
          <div className="flex items-center gap-3 px-[clamp(16px,3vw,32px)] pt-5 pb-1 text-[13px] tracking-[0.1em] text-ink-muted uppercase">
            <span className="h-px flex-1 bg-ink/12" />
            {dayLabel(m._creationTime, now)}
            <span className="h-px flex-1 bg-ink/12" />
          </div>
        )}
        <Message m={m} compact={compact} now={now} onOpenThread={onOpenThread} inThread={inThread} />
      </div>
    );
  });
}

const STARTERS: Record<string, string> = {
  general: "Introduce yourself and what you plan to write this month.",
  "check-ins": "Post about 100 words of today’s writing.",
  published: "Essays are posted here when they’re registered.",
  feedback: "Drop a draft link and say what kind of feedback you want.",
  ideas: "Share titles, hooks, and early ideas.",
  sf: "Saturday writing circles at Mox.",
  random: "Anything goes.",
};

function ChannelStart({ slug, empty }: { slug: string; empty: boolean }) {
  return (
    <div className="flex flex-col gap-2 px-[clamp(16px,3vw,32px)] pt-10 pb-4">
      <p className="font-display text-[34px] leading-none font-[340] tracking-[-0.02em]">
        Welcome to <span className="text-brass-numeral">#</span>
        <em className="wonk">{slug}</em>
      </p>
      <p className="text-[17px] text-ink-muted">
        {empty ? STARTERS[slug] ?? "This is the very beginning." : "This is the very beginning of the channel."}
      </p>
    </div>
  );
}

function Thread({ slug, parentId, onClose }: { slug: string; parentId: Id<"messages">; onClose: () => void }) {
  const data = useQuery(api.chat.thread, { parentId });
  const send = useMutation(api.chat.send);
  const onTyping = useTyping(slug, parentId);
  const now = useNow();
  const end = useRef<HTMLDivElement>(null);
  const count = data?.replies.length ?? 0;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      aria-label="Thread"
      className="fixed inset-0 z-30 flex flex-col bg-cream lg:static lg:z-auto lg:w-[min(440px,40vw)] lg:shrink-0 lg:border-l lg:border-ink/10"
    >
      <header className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
        <h2 className="font-display text-[22px] font-[450]">
          Thread <span className="text-[15px] font-normal text-ink-muted">in #{slug}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Close thread" className="-m-2 cursor-pointer p-2 text-[22px] leading-none text-ink-muted hover:text-ink">
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {data === null && <p className="p-5 text-ink-muted">This message was deleted.</p>}
        {data && (
          <>
            <Message m={data.parent} compact={false} now={now} inThread />
            <div className="flex items-center gap-3 px-8 py-2 text-[13px] text-ink-muted">
              {count} {count === 1 ? "reply" : "replies"} <span className="h-px flex-1 bg-ink/12" />
            </div>
            <MessageRun messages={data.replies} now={now} inThread />
          </>
        )}
        <div ref={end} />
      </div>
      {data && (
        <div className="px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
          <TypingIndicator slug={slug} parentId={parentId} />
          <Composer compact autoFocus placeholder="Reply…" onTyping={onTyping} onSend={async (body) => void (await send({ slug, body, parentId }))} />
        </div>
      )}
    </aside>
  );
}
