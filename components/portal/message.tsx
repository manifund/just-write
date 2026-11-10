"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatMessage } from "@/convex/chat";
import type { Id } from "@/convex/_generated/dataModel";
import { REACTIONS } from "@/convex/lib/reactions";
import { fmtWhen } from "@/convex/lib/time";
import { errorMessage } from "@/lib/convex";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { EmojiPicker } from "./emoji-picker";
import { useMember, usePortal } from "./context";
import { LiveImprovementCard } from "./improvement";
import {
  useEditMessage,
  useRemoveMessage,
  useToggleReaction,
} from "./optimistic";
import { MessageLinkPreviews } from "./message-link-preview";
import { RichText } from "./rich-text";
import { clockTime, hostOf, PENDING, timeAgo } from "./util";

export function Message({
  m,
  compact,
  now,
  animate,
  onOpenThread,
  inThread,
  highlight,
  onMarkUnread,
  editNow,
  onEditEnd,
}: {
  m: ChatMessage;
  compact: boolean; // same author as the previous message, shortly after
  now: number | null;
  animate?: boolean; // slide in, for messages that arrive while you're watching
  onOpenThread?: (id: Id<"messages">) => void;
  inThread?: boolean;
  highlight?: boolean; // the reply a shared link points to
  onMarkUnread?: () => void; // channel messages only: this one and later count as unread
  editNow?: boolean; // opened for editing from the composer (Up arrow)
  onEditEnd?: () => void;
}) {
  const { me, viewer } = usePortal();
  const author = useMember(m.authorId);
  const toggle = useToggleReaction(me._id);
  const edit = useEditMessage();
  const remove = useRemoveMessage();
  const [editingHere, setEditing] = useState(false);
  const editing = editingHere || !!editNow;
  // An edit that didn't save: the editor reopens with it so nothing is lost.
  const [failedEdit, setFailedEdit] = useState<{
    body: string;
    error: string;
  } | null>(null);
  const [picker, setPicker] = useState(false);
  const [whoReacted, setWhoReacted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closePicker = useCallback(() => setPicker(false), []);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Touch screens have no hover, so a long press opens the actions instead.
  const [held, setHeld] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const fired = useRef(false);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const closeActions = useCallback(() => {
    setHeld(false);
    setPicker(false);
    // A tapped action button keeps focus, which would keep the bar open via focus-within.
    const active = document.activeElement;
    if (active instanceof HTMLElement && articleRef.current?.contains(active))
      active.blur();
  }, []);
  useEffect(() => {
    if (!held) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      // The emoji picker renders outside the message, in <body>.
      if (t.closest?.("[data-emoji-picker]")) return;
      if (!articleRef.current?.contains(t)) closeActions();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [held, closeActions]);
  useEffect(() => () => cancelPress(), []);
  useEffect(() => {
    if (editNow) articleRef.current?.scrollIntoView({ block: "nearest" });
  }, [editNow]);
  const copyLink = () => {
    void navigator.clipboard
      .writeText(messageLink(m))
      .then(() => setCopied(true))
      .catch(() => {});
    if (held) closeActions();
  };
  const react = (emoji: string) => {
    void toggle({ messageId: m._id, emoji });
    if (held) closeActions();
  };
  const mine = m.authorId === me._id;
  // Sent but not yet saved (an optimistic update); it has no real id to act on yet.
  const pending = m._id.startsWith(PENDING);
  const profileHref = author?.bot
    ? "/improvements"
    : author?.handle
      ? `/members/${author.handle}`
      : "/members";

  return (
    <article
      ref={articleRef}
      data-message-id={m._id}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch" || editing || pending) return;
        if ((e.target as Element).closest("button, input, [contenteditable]"))
          return;
        cancelPress();
        fired.current = false;
        press.current = {
          x: e.clientX,
          y: e.clientY,
          timer: window.setTimeout(() => {
            press.current = null;
            fired.current = true;
            setHeld(true);
            navigator.vibrate?.(10);
          }, 450),
        };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)
          cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        // Android opens a menu on long press; we show our own actions instead.
        if (fired.current || press.current) e.preventDefault();
      }}
      onClickCapture={(e) => {
        // Releasing a long press shouldn't also follow a link under the finger.
        if (fired.current) {
          fired.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`group relative grid pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none] grid-cols-[40px_minmax(0,1fr)] gap-x-3 px-[clamp(16px,3vw,32px)] transition-colors hover:bg-cream-deep/45 ${
        animate ? "motion-safe:animate-[rise_220ms_ease-out]" : ""
      } ${pending ? "opacity-60" : ""} ${highlight ? "bg-brass/12" : ""} ${compact ? "py-0.5" : "pt-3 pb-0.5"}`}
    >
      <div className="relative pt-0.5">
        {compact ? (
          // Out of flow and only toggling visibility, so hovering never changes the row's height.
          <span
            className={`absolute inset-x-0 top-1.5 text-right text-[11px] leading-none whitespace-nowrap text-ink-muted tabular-nums group-focus-within:visible group-hover:visible ${
              held || copied ? "visible" : "invisible"
            }`}
          >
            <Timestamp m={m} copied={copied} onCopy={copyLink} />
            {m.editedAt && <span className="block">edited</span>}
          </span>
        ) : (
          <Link href={profileHref} aria-label={author?.name}>
            <Avatar member={author} size={40} />
          </Link>
        )}
      </div>
      <div className="min-w-0">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <Link
              href={profileHref}
              className="font-[700] no-underline hover:underline"
            >
              {author?.name ?? "Someone"}
            </Link>
            {author?.bot && (
              <span className="bg-wash-light px-1.5 py-px text-[11px] tracking-[0.08em] text-ink-muted uppercase">
                bot
              </span>
            )}
            <span className="text-[13px] text-ink-muted">
              <Timestamp m={m} copied={copied} onCopy={copyLink} />
            </span>
            {m.editedAt && (
              <span className="text-[12px] text-ink-muted">(edited)</span>
            )}
          </div>
        )}

        {editing ? (
          <div className="py-1.5">
            <Composer
              compact
              autoFocus
              initial={failedEdit?.body ?? m.body}
              placeholder="Edit message"
              submitLabel="Save"
              onCancel={() => {
                setEditing(false);
                setFailedEdit(null);
                onEditEnd?.();
              }}
              onSend={async (body) => {
                // Shows the new text right away; the save finishes in the background.
                setEditing(false);
                setFailedEdit(null);
                onEditEnd?.();
                edit({ messageId: m._id, body }).catch((err) => {
                  setFailedEdit({ body, error: errorMessage(err) });
                  setEditing(true);
                });
              }}
            />
            {failedEdit && (
              <p role="alert" className="pt-1 text-[14px] text-brass-text">
                {failedEdit.error}
              </p>
            )}
          </div>
        ) : m.improvementId ? (
          <LiveImprovementCard id={m.improvementId} isAdmin={viewer.isAdmin} />
        ) : m.essay ? (
          <EssayPost essay={m.essay} />
        ) : m.event ? (
          <EventPost event={m.event} />
        ) : m.kind === "joined" ? (
          <p className="py-1 text-[16px] text-ink-muted">
            joined Just Write 👋
          </p>
        ) : m.hidden ? (
          <HiddenPost preview={m.text} />
        ) : (
          <div className="text-[17px] leading-[1.35]">
            <RichText body={m.body} />
            <MessageLinkPreviews body={m.body} />
          </div>
        )}

        {m.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {m.reactions.map((r) => (
              <ReactionChip
                key={r.emoji}
                emoji={r.emoji}
                memberIds={r.memberIds}
                onClick={() => react(r.emoji)}
                onLongPress={() => setWhoReacted(true)}
              />
            ))}
          </div>
        )}
        {whoReacted && m.reactions.length > 0 && (
          <WhoReacted
            reactions={m.reactions}
            onClose={() => setWhoReacted(false)}
          />
        )}

        {!inThread && (m.replyCount ?? 0) > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(m._id)}
            className="mt-1 -ml-1.5 flex cursor-pointer items-center gap-2 px-1.5 py-1 text-[14px] transition-colors hover:bg-cream"
          >
            <span className="flex -space-x-1.5">
              {(m.replierIds ?? []).map((id) => (
                <ReplierAvatar key={id} id={id} />
              ))}
            </span>
            <span className="font-[700] text-brass-text">
              {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
            </span>
            {m.lastReplyAt && now && (
              <span className="text-ink-muted">
                {timeAgo(m.lastReplyAt, now)}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {!editing && !pending && (
        <div
          ref={actionsRef}
          className={`absolute -top-3.5 right-[clamp(16px,3vw,32px)] z-10 items-center border border-ink/15 bg-cream shadow-[0_4px_12px_-6px_rgb(56_33_63/0.3)] ${
            picker || confirmDelete || held
              ? "flex"
              : "hidden group-focus-within:flex group-hover:flex"
          }`}
        >
          {confirmDelete ? (
            <span className="flex items-center gap-2 px-3 py-1 text-[14px]">
              Delete this{(m.replyCount ?? 0) > 0 ? " and its replies" : ""}?
              <button
                type="button"
                className="cursor-pointer font-[700] text-brass-text underline"
                onClick={() => remove({ messageId: m._id })}
              >
                Delete
              </button>
              <button
                type="button"
                className="cursor-pointer underline"
                onClick={() => {
                  setConfirmDelete(false);
                  if (held) closeActions();
                }}
              >
                Cancel
              </button>
            </span>
          ) : (
            <>
              {REACTIONS.slice(0, 4).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`React ${e}`}
                  className="cursor-pointer px-1.5 py-1 text-[17px] transition-transform hover:scale-125"
                  onClick={() => react(e)}
                >
                  {e}
                </button>
              ))}
              <span data-emoji-toggle className="contents">
                <ActionButton
                  label="More reactions"
                  onClick={() => setPicker((p) => !p)}
                >
                  <svg
                    aria-hidden="true"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01" />
                  </svg>
                </ActionButton>
              </span>
              {picker && (
                <EmojiPicker
                  anchor={actionsRef}
                  onPick={(e) => {
                    react(e);
                    setPicker(false);
                  }}
                  onClose={closePicker}
                />
              )}
              {!inThread && onOpenThread && (
                <ActionButton
                  label="Reply in thread"
                  onClick={() => {
                    closeActions();
                    onOpenThread(m._id);
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  >
                    <path d="M4 5h16v11H9l-5 4z" />
                  </svg>
                </ActionButton>
              )}
              {onMarkUnread && !m.parentId && (
                <ActionButton
                  label="Mark unread"
                  onClick={() => {
                    closeActions();
                    onMarkUnread();
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  >
                    <path d="M4 6h11M4 12h16v8H4zM4 6v6" />
                    <circle
                      cx="19"
                      cy="6"
                      r="2.5"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </ActionButton>
              )}
              {mine && !m.essay && !m.event && !m.kind && (
                <ActionButton
                  label="Edit"
                  onClick={() => {
                    closeActions();
                    setEditing(true);
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  >
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                  </svg>
                </ActionButton>
              )}
              {(mine || viewer.isAdmin) && !m.essay && (
                <ActionButton
                  label="Delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
                  </svg>
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

// A link that opens the message's thread; for a reply, it also points at the reply.
function messageLink(m: ChatMessage) {
  const slug = window.location.pathname.split("/")[2] ?? "";
  const url = new URL(
    `/chat/${slug}/${m.parentId ?? m._id}`,
    window.location.origin,
  );
  if (m.parentId) url.searchParams.set("message", m._id);
  return url.toString();
}

// The message's time; clicking it copies a link to the message.
function Timestamp({
  m,
  copied,
  onCopy,
}: {
  m: ChatMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={onCopy}
        title={`${new Date(m._creationTime).toLocaleString()} · Click to copy link`}
        aria-label={`${clockTime(m._creationTime)}, copy link to message`}
        className="cursor-pointer hover:text-ink hover:underline"
      >
        <time dateTime={new Date(m._creationTime).toISOString()}>
          {clockTime(m._creationTime)}
        </time>
      </button>
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 bg-ink px-2 py-1 text-[12px] leading-none whitespace-nowrap text-cream shadow-[0_4px_12px_-6px_rgb(56_33_63/0.4)] motion-safe:animate-[fade-in_120ms_ease-out]"
        >
          Link copied
        </span>
      )}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex size-8 cursor-pointer items-center justify-center text-ink-muted transition-colors hover:bg-cream-deep hover:text-ink"
    >
      {children}
    </button>
  );
}

function ReplierAvatar({ id }: { id: string }) {
  const m = useMember(id);
  return (
    <Avatar member={m} size={20} className="rounded-full ring-2 ring-cream" />
  );
}

function ReactionChip({
  emoji,
  memberIds,
  onClick,
  onLongPress,
}: {
  emoji: string;
  memberIds: string[];
  onClick: () => void;
  onLongPress: () => void;
}) {
  const { me, roster } = usePortal();
  // Touch screens can't hover for the names, so a long press lists them instead.
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const fired = useRef(false);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => () => cancelPress(), []);
  const mine = memberIds.includes(me._id);
  const names = memberIds.map((id) =>
    id === me._id ? "You" : (roster.get(id)?.name.split(" ")[0] ?? "Someone"),
  );
  return (
    <button
      type="button"
      onClick={() => {
        // Releasing a long press shouldn't also toggle the reaction.
        if (fired.current) {
          fired.current = false;
          return;
        }
        onClick();
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        cancelPress();
        fired.current = false;
        press.current = {
          x: e.clientX,
          y: e.clientY,
          timer: window.setTimeout(() => {
            press.current = null;
            fired.current = true;
            navigator.vibrate?.(10);
            onLongPress();
          }, 450),
        };
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)
          cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        if (fired.current || press.current) e.preventDefault();
      }}
      aria-label={`${names.join(", ")} reacted ${emoji}`}
      aria-pressed={mine}
      className={`group/chip relative flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[14px] tabular-nums transition-colors motion-safe:animate-[pop_250ms_ease-out] ${
        mine
          ? "border-brass bg-brass/15 text-brass-text"
          : "border-ink/15 bg-cream hover:border-ink/40"
      }`}
    >
      <span className="text-[15px]">{emoji}</span>
      {memberIds.length}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[16rem] -translate-x-1/2 bg-ink px-2 py-1 text-left text-[13px] leading-snug text-cream shadow-[0_4px_12px_-6px_rgb(56_33_63/0.4)] group-hover/chip:block group-focus-visible/chip:block"
      >
        {names.join(", ")} reacted {emoji}
      </span>
    </button>
  );
}

// A sheet listing everyone who reacted, opened by long-pressing a reaction.
function WhoReacted({
  reactions,
  onClose,
}: {
  reactions: ChatMessage["reactions"];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      data-emoji-picker
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Reactions"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[70vh] w-full overflow-y-auto bg-cream px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-[0_-4px_20px_-8px_rgb(56_33_63/0.4)] sm:max-w-sm"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] tracking-[0.1em] text-ink-muted uppercase">
            Reactions
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-2 py-1 text-[14px] text-ink-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        {reactions.map((r) => (
          <section key={r.emoji} className="border-t border-ink/10 py-2">
            <p className="mb-1 text-[20px]">
              {r.emoji}{" "}
              <span className="text-[14px] text-ink-muted tabular-nums">
                {r.memberIds.length}
              </span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {r.memberIds.map((id) => (
                <Reactor key={id} id={id} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Reactor({ id }: { id: string }) {
  const { me } = usePortal();
  const m = useMember(id);
  return (
    <li className="flex items-center gap-2.5 text-[16px]">
      <Avatar member={m} size={28} />
      {m?.name ?? "Someone"}
      {id === me._id && <span className="text-ink-muted">(you)</span>}
    </li>
  );
}

// What a #check-ins post looks like before you've posted your own today: the first
// hundred characters, then a rule and a label in the style of the day dividers.
function HiddenPost({ preview }: { preview: string }) {
  return (
    <div className="py-0.5">
      {preview && (
        <p className="text-[17px] leading-[1.35] text-ink-muted/80">
          {preview}
        </p>
      )}
      <p className="mt-1.5 flex items-center gap-2.5 text-[12px] tracking-[0.1em] text-ink-muted uppercase">
        <span className="h-px w-6 bg-ink/15" />
        hidden until you’ve checked in
      </p>
    </div>
  );
}

function EventPost({ event }: { event: NonNullable<ChatMessage["event"]> }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      <p className="text-[16px] text-ink-muted">scheduled a session</p>
      <Link
        href={`/calendar/${event.slug}`}
        className="flex max-w-[34rem] flex-col gap-1 border-l-4 border-ink bg-cream-deep px-4 py-3 no-underline transition-colors hover:bg-cream-hover"
      >
        <span
          className={`font-display text-[21px] leading-[1.2] font-[450] text-pretty ${event.canceled ? "line-through" : ""}`}
        >
          {event.title}
        </span>
        <span className="text-[14px] text-ink-muted">
          {event.canceled ? "Canceled. " : ""}
          {fmtWhen(event.start, event.end)}
          {event.location ? `, ${event.location}` : ""}
        </span>
      </Link>
    </div>
  );
}

function EssayPost({ essay }: { essay: NonNullable<ChatMessage["essay"]> }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      <p className="text-[16px] text-ink-muted">published an essay ✍️</p>
      <a
        href={essay.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex max-w-[34rem] flex-col gap-1 border-l-4 border-brass bg-cream-deep px-4 py-3 no-underline transition-colors hover:bg-cream-hover"
      >
        <span className="font-display text-[21px] leading-[1.2] font-[450] text-pretty">
          {essay.title}
        </span>
        <span className="text-[14px] text-ink-muted">
          {hostOf(essay.url)}
          {essay.wordCount
            ? ` · ~${essay.wordCount.toLocaleString()} words`
            : ""}
        </span>
      </a>
    </div>
  );
}
