"use client";

import type { OptimisticLocalStore } from "convex/browser";
import {
  insertAtTop,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/convex/chat";
import {
  channelRoom,
  CHECK_IN_SLUG,
  notificationTag,
  PAGE_SIZE,
} from "@/convex/lib/channels";
import { cleanBody, mentionIds } from "@/convex/lib/richtext";
import { pushChatUrl, replaceChatUrl, useChatUrl } from "@/lib/chat-url";
import { errorMessage } from "@/lib/convex";
import { closeNotifications } from "@/lib/push";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { usePortal } from "./context";
import { Message } from "./message";
import { useRoom } from "./presence";
import { dayLabel, PENDING, useNow } from "./util";

const GROUP_MS = 5 * 60 * 1000;

export function ChannelFromUrl() {
  // From lib/chat-url rather than the router: switching channels and opening threads
  // change the URL there without a router navigation (see that file for why).
  // /chat/<slug>/<thread id> is the open thread, so it can be linked and works with
  // Back/Forward. Older links used /chat/<slug>?thread=<id>, which still works.
  const { pathname, search } = useChatUrl();
  const parts = pathname.split("/");
  const slug = decodeURIComponent(parts[2] ?? "");
  const legacy = search.get("thread");
  const inPath = parts[3] ? decodeURIComponent(parts[3]) : null;
  const thread = (inPath || legacy || null) as Id<"messages"> | null;
  // ?message=<id> is a reply in that thread, from a shared link.
  const reply = search.get("message") as Id<"messages"> | null;
  // Rewrite an old ?thread= link to the path form, keeping any other params.
  useEffect(() => {
    if (!legacy || inPath) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("thread");
    url.pathname = threadUrl(slug, legacy as Id<"messages">);
    replaceChatUrl(url.pathname + url.search);
  }, [legacy, inPath, slug]);
  return <Channel key={slug} slug={slug} threadId={thread} replyId={reply} />;
}

// The last thread open in each channel during this visit. On wide screens, where the
// thread sits beside the channel, coming back to a channel reopens it.
const lastThread = new Map<string, Id<"messages">>();
const WIDE = "(min-width: 1024px)"; // Tailwind's lg, where the thread panel stops covering the page

// Set on history entries added by opening a thread, so closing it can just go Back.
const OPENED = "jwThreadOpened";

function threadUrl(slug: string, id: Id<"messages"> | null) {
  return id ? `/chat/${slug}/${id}` : `/chat/${slug}`;
}

function openThread(slug: string, id: Id<"messages">, current: string | null) {
  if (current === id) return;
  if (current) {
    // Switching threads replaces the entry, so one Back still returns to the channel.
    const opened = window.history.state?.[OPENED] === true;
    replaceChatUrl(
      threadUrl(slug, id),
      opened ? { [OPENED]: true } : undefined,
    );
  } else {
    pushChatUrl(threadUrl(slug, id), { [OPENED]: true });
  }
}

function closeThread(slug: string) {
  lastThread.delete(slug);
  if (window.history.state?.[OPENED]) window.history.back();
  else replaceChatUrl(threadUrl(slug, null));
}

// Keeps lastThread up to date, and restores it when arriving at a channel on a wide screen.
function useRememberThread(slug: string, threadId: Id<"messages"> | null) {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const arrived = seen.current !== slug;
    seen.current = slug;
    if (arrived && !threadId) {
      const last = lastThread.get(slug);
      if (last && window.matchMedia(WIDE).matches) {
        replaceChatUrl(threadUrl(slug, last));
        return;
      }
    }
    if (threadId) lastThread.set(slug, threadId);
    else lastThread.delete(slug);
  }, [slug, threadId]);
  // Hidden pages kept by the router count as a fresh arrival when shown again.
  useEffect(
    () => () => {
      seen.current = null;
    },
    [],
  );
}

// What a message will look like once the server saves it, shown while it's sending.
function pendingMessage(
  args: { body: string; parentId?: Id<"messages"> },
  authorId: Id<"members">,
  channelId: Id<"channels">,
): ChatMessage | null {
  try {
    const { body, text } = cleanBody(args.body);
    if (!text) return null;
    return {
      _id: `${PENDING}${crypto.randomUUID()}` as Id<"messages">,
      _creationTime: Date.now(),
      channelId,
      authorId,
      body,
      text,
      parentId: args.parentId,
      reactions: [],
      essay: null,
      event: null,
      hidden: false,
    };
  } catch {
    return null; // the server will reject it with a proper error
  }
}

function mentionsBot(body: string, roster: Map<string, { bot: boolean }>) {
  try {
    return mentionIds(JSON.parse(body)).some((id) => roster.get(id)?.bot);
  } catch {
    return false;
  }
}

function addToChannel(
  store: OptimisticLocalStore,
  slug: string,
  item: ChatMessage,
) {
  insertAtTop({
    paginatedQuery: api.chat.messages,
    argsToMatch: { slug },
    localQueryStore: store,
    item,
  });
  const recent = store.getQuery(api.chat.recent, { slug });
  if (recent)
    store.setQuery(
      api.chat.recent,
      { slug },
      { ...recent, messages: [item, ...recent.messages] },
    );
}

export function Channel({
  slug,
  threadId,
  replyId = null,
}: {
  slug: string;
  threadId: Id<"messages"> | null;
  replyId?: Id<"messages"> | null;
}) {
  // The sidebar already subscribes to the channel list, so this is usually ready immediately.
  const channels = useQuery(api.chat.channels);
  const channel =
    channels === undefined
      ? undefined
      : (channels.find((c) => c.slug === slug) ?? null);
  useRememberThread(slug, threadId);
  const onOpenThread = useCallback(
    (id: Id<"messages">) => openThread(slug, id, threadId),
    [slug, threadId],
  );
  const onCloseThread = useCallback(() => closeThread(slug), [slug]);
  const here = useRoom(channelRoom(slug));

  if (channel === undefined) return <div className="h-full" aria-busy="true" />;
  if (channel === null) {
    return (
      <p className="p-10 text-[18px] text-ink-muted">
        That channel doesn’t exist.
      </p>
    );
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
            <p className="truncate text-[15px] text-ink-muted">
              {channel.description}
            </p>
          </div>
          {here.length > 0 && (
            <div
              className="ml-auto flex shrink-0 items-center gap-2"
              title={here.map((m) => m.name).join(", ")}
            >
              <span className="flex -space-x-2">
                {here.slice(0, 5).map((m) => (
                  <Avatar
                    key={m._id}
                    member={m}
                    size={28}
                    className="rounded-full ring-2 ring-cream"
                  />
                ))}
              </span>
              <span className="hidden text-[14px] text-ink-muted sm:inline">
                {here.length} here
              </span>
            </div>
          )}
        </header>
        <MessageList
          key={slug}
          slug={slug}
          channelId={channel._id}
          locked={channel.locked}
          onOpenThread={onOpenThread}
        />
      </div>
      {threadId && (
        <Thread
          key={threadId}
          slug={slug}
          parentId={threadId}
          replyId={replyId}
          onClose={onCloseThread}
        />
      )}
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

function TypingIndicator({
  slug,
  parentId,
}: {
  slug: string;
  parentId: Id<"messages"> | null;
}) {
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
          <span
            className="mr-1.5 inline-flex gap-0.5 align-middle"
            aria-hidden="true"
          >
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

function MessageList({
  slug,
  channelId,
  locked,
  onOpenThread,
}: {
  slug: string;
  channelId: Id<"channels">;
  locked: boolean; // #check-ins: others' posts are previews until you post today
  onOpenThread: (id: Id<"messages">) => void;
}) {
  const { me, roster } = usePortal();
  const paged = usePaginatedQuery(
    api.chat.messages,
    { slug },
    { initialNumItems: PAGE_SIZE },
  );
  // Kept warm by the sidebar, so it fills in while the paginated query loads.
  const recent = useQuery(api.chat.recent, { slug });
  const firstLoad = paged.status === "LoadingFirstPage";
  const results = firstLoad ? (recent?.messages ?? []) : paged.results;
  const { status, loadMore } = paged;
  const exhausted =
    status === "Exhausted" || (firstLoad && recent?.more === false);
  const send = useMutation(api.chat.send).withOptimisticUpdate(
    (store, args) => {
      const item = pendingMessage(args, me._id, channelId);
      if (item) addToChannel(store, slug, item);
    },
  );
  const markRead = useMutation(api.chat.markRead);
  const markUnreadMutation = useMutation(api.chat.markUnread);
  // Set by "Mark unread": stop marking the channel read until you leave it,
  // and show where unread starts.
  const holdUnread = useRef(false);
  const [unreadFrom, setUnreadFrom] = useState<number | null>(null);
  const onTyping = useTyping(slug);
  const now = useNow();
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  // Only messages that arrive after the channel opens get the entrance animation.
  const [openedAt] = useState(() => Date.now());
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

  // Mark read when a message arrives while you're looking, or when you come back to the tab.
  useEffect(() => {
    if (!newest) return;
    const read = () => {
      if (document.visibilityState !== "visible" || holdUnread.current) return;
      void markRead({ slug });
      void closeNotifications(notificationTag(slug));
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
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
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {/* Anchors a short conversation to the bottom, next to the composer. */}
        <div className="flex min-h-full flex-col justify-end pb-2">
          {exhausted && (
            <ChannelStart slug={slug} empty={messages.length === 0} />
          )}
          {status === "LoadingMore" && (
            <p className="py-3 text-center text-[14px] text-ink-muted">
              Loading earlier messages…
            </p>
          )}
          <MessageRun
            messages={messages}
            now={now}
            animateAfter={openedAt}
            onOpenThread={onOpenThread}
            unreadFrom={unreadFrom}
            onMarkUnread={(m) => {
              holdUnread.current = true;
              setUnreadFrom(m._creationTime);
              setError(null);
              markUnreadMutation({ messageId: m._id }).catch((err) =>
                setError(errorMessage(err)),
              );
            }}
          />
        </div>
      </div>
      <div className="px-[clamp(16px,3vw,32px)] pb-[max(12px,env(safe-area-inset-bottom))]">
        <TypingIndicator slug={slug} parentId={null} />
        {locked && (
          <p className="pb-1.5 text-[14px] text-ink-muted">
            Post today’s check-in to read everyone else’s.
          </p>
        )}
        <Composer
          draftKey={slug}
          wordCount={slug === CHECK_IN_SLUG}
          placeholder={
            locked ? "About 100 words of today’s writing" : `Message #${slug}`
          }
          onTyping={onTyping}
          onSend={async (body) => {
            setError(null);
            atBottom.current = true;
            try {
              const id = await send({ slug, body });
              // Asking @Claude: open the thread where its live status card appears.
              if (mentionsBot(body, roster)) onOpenThread(id);
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
  animateAfter,
  onOpenThread,
  inThread,
  highlightId,
  unreadFrom,
  onMarkUnread,
}: {
  messages: ChatMessage[];
  now: number | null;
  animateAfter: number;
  onOpenThread?: (id: Id<"messages">) => void;
  inThread?: boolean;
  highlightId?: Id<"messages"> | null;
  unreadFrom?: number | null; // draw an "Unread" line above the first message from here on
  onMarkUnread?: (m: ChatMessage) => void;
}) {
  const { me } = usePortal();
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const firstUnread =
      unreadFrom != null &&
      m._creationTime >= unreadFrom &&
      (!prev || prev._creationTime < unreadFrom);
    const newDay =
      !prev ||
      new Date(prev._creationTime).toDateString() !==
        new Date(m._creationTime).toDateString();
    const compact =
      !!prev &&
      !newDay &&
      prev.authorId === m.authorId &&
      !prev.essay &&
      !m.essay &&
      !prev.kind &&
      !m.kind &&
      m._creationTime - prev._creationTime < GROUP_MS;
    return (
      <div key={m._id}>
        {newDay && now !== null && (
          <div className="flex items-center gap-3 px-[clamp(16px,3vw,32px)] pt-5 pb-1 text-[13px] tracking-[0.1em] text-ink-muted uppercase">
            <span className="h-px flex-1 bg-ink/12" />
            {dayLabel(m._creationTime, now)}
            <span className="h-px flex-1 bg-ink/12" />
          </div>
        )}
        {firstUnread && (
          <div className="flex items-center gap-3 px-[clamp(16px,3vw,32px)] pt-2 pb-1 text-[13px] tracking-[0.1em] text-brass-text uppercase">
            <span className="h-px flex-1 bg-brass-text/40" />
            Unread
            <span className="h-px flex-1 bg-brass-text/40" />
          </div>
        )}
        <Message
          m={m}
          compact={compact}
          now={now}
          // Your own messages appear without animating: the optimistic copy is
          // swapped for the saved one, and animating both would look like a flicker.
          animate={m.authorId !== me._id && m._creationTime > animateAfter}
          onOpenThread={onOpenThread}
          inThread={inThread}
          highlight={m._id === highlightId}
          onMarkUnread={onMarkUnread && (() => onMarkUnread(m))}
        />
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
        {empty
          ? (STARTERS[slug] ?? "This is the very beginning.")
          : "This is the very beginning of the channel."}
      </p>
    </div>
  );
}

// The thread panel's width on wide screens, kept per device. Unset means the default.
const THREAD_WIDTH_KEY = "jwThreadWidth";
const THREAD_MIN = 320;
const THREAD_MAX_FRACTION = 0.6; // of the window, so the channel stays usable

function clampThreadWidth(w: number) {
  return Math.round(
    Math.max(THREAD_MIN, Math.min(w, window.innerWidth * THREAD_MAX_FRACTION)),
  );
}

function useThreadWidth() {
  const [width, setWidth] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(THREAD_WIDTH_KEY));
    return saved > 0 ? saved : null;
  });
  const save = useCallback((w: number | null) => {
    setWidth(w);
    if (w === null) localStorage.removeItem(THREAD_WIDTH_KEY);
    else localStorage.setItem(THREAD_WIDTH_KEY, String(w));
  }, []);
  return [width, save] as const;
}

function ResizeHandle({
  panel,
  width,
  onResize,
}: {
  panel: RefObject<HTMLElement | null>;
  width: number | null;
  onResize: (w: number | null) => void;
}) {
  const current = () => width ?? panel.current?.offsetWidth ?? 440;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize thread"
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none focus:outline-none lg:block"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startW = current();
        let next = startW;
        const move = (ev: PointerEvent) => {
          next = clampThreadWidth(startW + startX - ev.clientX);
          if (panel.current)
            panel.current.style.setProperty("--thread-w", `${next}px`);
        };
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          document.body.style.removeProperty("cursor");
          document.body.style.removeProperty("user-select");
          if (next !== startW) onResize(next);
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      }}
      onDoubleClick={() => onResize(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 20;
        if (e.key === "ArrowLeft") onResize(clampThreadWidth(current() + step));
        else if (e.key === "ArrowRight")
          onResize(clampThreadWidth(current() - step));
        else return;
        e.preventDefault();
      }}
    >
      <span className="mx-auto block h-full w-0.5 bg-transparent transition-colors group-hover:bg-brass/50 group-focus-visible:bg-brass/70 group-active:bg-brass/70" />
    </div>
  );
}

function Thread({
  slug,
  parentId,
  replyId,
  onClose,
}: {
  slug: string;
  parentId: Id<"messages">;
  replyId: Id<"messages"> | null;
  onClose: () => void;
}) {
  const { me } = usePortal();
  const data = useQuery(api.chat.thread, { parentId });
  const send = useMutation(api.chat.send).withOptimisticUpdate(
    (store, args) => {
      const thread = store.getQuery(api.chat.thread, { parentId });
      if (!thread) return;
      const item = pendingMessage(args, me._id, thread.parent.channelId);
      if (!item) return;
      store.setQuery(
        api.chat.thread,
        { parentId },
        {
          parent: { ...thread.parent, replyCount: thread.replies.length + 1 },
          replies: [...thread.replies, item],
        },
      );
    },
  );
  const onTyping = useTyping(slug, parentId);
  const now = useNow();
  const [openedAt] = useState(() => Date.now());
  const end = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [width, setWidth] = useThreadWidth();
  const jumped = useRef(false);
  const count = data?.replies.length ?? 0;

  useEffect(() => {
    // A shared link to a reply scrolls to that reply once, instead of the end.
    if (replyId && !jumped.current && count > 0) {
      jumped.current = true;
      const target = panel.current?.querySelector(
        `[data-message-id="${CSS.escape(replyId)}"]`,
      );
      if (target) {
        target.scrollIntoView({ block: "center" });
        return;
      }
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [count, replyId]);

  useEffect(() => {
    void closeNotifications(notificationTag(slug, parentId));
  }, [slug, parentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      ref={panel}
      aria-label="Thread"
      style={
        width === null
          ? undefined
          : ({ "--thread-w": `${width}px` } as CSSProperties)
      }
      className="fixed inset-0 z-30 flex flex-col bg-cream md:left-[264px] lg:relative lg:inset-auto lg:z-auto lg:w-(--thread-w,min(440px,40vw)) lg:max-w-[60vw] lg:min-w-[320px] lg:shrink-0 lg:border-l lg:border-ink/10"
    >
      <ResizeHandle panel={panel} width={width} onResize={setWidth} />
      <header className="flex items-center justify-between border-b border-ink/10 px-5 py-3.5">
        <h2 className="font-display text-[22px] font-[450]">
          Thread{" "}
          <span className="text-[15px] font-normal text-ink-muted">
            in #{slug}
          </span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          className="-m-2 cursor-pointer p-2 text-[22px] leading-none text-ink-muted hover:text-ink"
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pt-4 pb-3">
        {data === null && (
          <p className="p-5 text-ink-muted">This message was deleted.</p>
        )}
        {data && (
          <>
            <Message m={data.parent} compact={false} now={now} inThread />
            <div className="flex items-center gap-3 px-8 py-2 text-[13px] text-ink-muted">
              {count} {count === 1 ? "reply" : "replies"}{" "}
              <span className="h-px flex-1 bg-ink/12" />
            </div>
            <MessageRun
              messages={data.replies}
              now={now}
              animateAfter={openedAt}
              inThread
              highlightId={replyId}
            />
          </>
        )}
        <div ref={end} />
      </div>
      {data && (
        <div className="px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
          <TypingIndicator slug={slug} parentId={parentId} />
          <Composer
            compact
            // Focusing opens the keyboard on phones, which gets in the way of reading.
            autoFocus={
              window.matchMedia("(hover: hover) and (pointer: fine)").matches
            }
            draftKey={`${slug}/${parentId}`}
            placeholder="Reply…"
            onTyping={onTyping}
            onSend={async (body) => void (await send({ slug, body, parentId }))}
          />
        </div>
      )}
    </aside>
  );
}
