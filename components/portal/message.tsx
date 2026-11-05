"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/convex/chat";
import type { Id } from "@/convex/_generated/dataModel";
import { REACTIONS } from "@/convex/lib/reactions";
import { fmtWhen } from "@/convex/lib/time";
import { errorMessage } from "@/lib/convex";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { EmojiPicker } from "./emoji-picker";
import { useMember, usePortal } from "./context";
import { ImprovementCard } from "./improvement";
import {
  useEditMessage,
  useRemoveMessage,
  useToggleReaction,
} from "./optimistic";
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
}: {
  m: ChatMessage;
  compact: boolean; // same author as the previous message, shortly after
  now: number | null;
  animate?: boolean; // slide in, for messages that arrive while you're watching
  onOpenThread?: (id: Id<"messages">) => void;
  inThread?: boolean;
  highlight?: boolean; // the reply a shared link points to
}) {
  const { me, viewer } = usePortal();
  const author = useMember(m.authorId);
  const toggle = useToggleReaction(me._id);
  const edit = useEditMessage();
  const remove = useRemoveMessage();
  const [editing, setEditing] = useState(false);
  // An edit that didn't save: the editor reopens with it so nothing is lost.
  const [failedEdit, setFailedEdit] = useState<{
    body: string;
    error: string;
  } | null>(null);
  const [picker, setPicker] = useState(false);
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
          <time className="invisible absolute inset-x-0 top-1.5 text-right text-[11px] leading-none whitespace-nowrap text-ink-muted tabular-nums group-hover:visible">
            {clockTime(m._creationTime)}
            {m.editedAt && <span className="block">edited</span>}
          </time>
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
            <time
              className="text-[13px] text-ink-muted"
              title={new Date(m._creationTime).toLocaleString()}
            >
              {clockTime(m._creationTime)}
            </time>
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
              }}
              onSend={async (body) => {
                // Shows the new text right away; the save finishes in the background.
                setEditing(false);
                setFailedEdit(null);
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
        ) : m.improvement ? (
          <ImprovementCard card={m.improvement} isAdmin={viewer.isAdmin} />
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
              />
            ))}
          </div>
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
            picker || confirmDelete || held || copied
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
              <ActionButton
                label={copied ? "Link copied" : "Copy link"}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(messageLink(m))
                    .then(() => setCopied(true))
                    .catch(() => {});
                  if (held) closeActions();
                }}
              >
                {copied ? (
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                ) : (
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
                    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
                    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                  </svg>
                )}
              </ActionButton>
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
  const url = new URL(`/chat/${slug}`, window.location.origin);
  url.searchParams.set("thread", m.parentId ?? m._id);
  if (m.parentId) url.searchParams.set("message", m._id);
  return url.toString();
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
}: {
  emoji: string;
  memberIds: string[];
  onClick: () => void;
}) {
  const { me, roster } = usePortal();
  const mine = memberIds.includes(me._id);
  const names = memberIds.map((id) =>
    id === me._id ? "You" : (roster.get(id)?.name.split(" ")[0] ?? "Someone"),
  );
  return (
    <button
      type="button"
      onClick={onClick}
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
        className="flex max-w-[34rem] flex-col gap-1 border-l-4 border-ink bg-cream-deep px-4 py-3 no-underline transition-colors hover:bg-[#ecd5d1]"
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
        className="flex max-w-[34rem] flex-col gap-1 border-l-4 border-brass bg-cream-deep px-4 py-3 no-underline transition-colors hover:bg-[#ecd5d1]"
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
