"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { ChatMessage } from "@/convex/chat";
import type { Id } from "@/convex/_generated/dataModel";
import { REACTIONS } from "@/convex/lib/reactions";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { useMember, usePortal } from "./context";
import { RichText } from "./rich-text";
import { clockTime, hostOf, PENDING, timeAgo } from "./util";

export function Message({
  m,
  compact,
  now,
  animate,
  onOpenThread,
  inThread,
}: {
  m: ChatMessage;
  compact: boolean; // same author as the previous message, shortly after
  now: number | null;
  animate?: boolean; // slide in, for messages that arrive while you're watching
  onOpenThread?: (id: Id<"messages">) => void;
  inThread?: boolean;
}) {
  const { me, viewer } = usePortal();
  const author = useMember(m.authorId);
  const toggle = useMutation(api.chat.toggleReaction);
  const edit = useMutation(api.chat.edit);
  const remove = useMutation(api.chat.remove);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = m.authorId === me._id;
  // Sent but not yet saved (an optimistic update); it has no real id to act on yet.
  const pending = m._id.startsWith(PENDING);
  const profileHref = author?.handle ? `/members/${author.handle}` : "/members";

  return (
    <article
      className={`group relative grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 px-[clamp(16px,3vw,32px)] transition-colors hover:bg-cream-deep/45 ${
        animate ? "motion-safe:animate-[rise_220ms_ease-out]" : ""
      } ${pending ? "opacity-60" : ""} ${compact ? "py-0.5" : "pt-3 pb-0.5"}`}
    >
      <div className="relative pt-0.5">
        {compact ? (
          // Out of flow and only toggling visibility, so hovering never changes the row's height.
          <time className="invisible absolute inset-x-0 top-1.5 text-right text-[11px] leading-none whitespace-nowrap text-ink-muted tabular-nums group-hover:visible">
            {clockTime(m._creationTime)}
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
            <time
              className="text-[13px] text-ink-muted"
              title={new Date(m._creationTime).toLocaleString()}
            >
              {clockTime(m._creationTime)}
            </time>
          </div>
        )}

        {editing ? (
          <div className="py-1.5">
            <Composer
              compact
              autoFocus
              initial={m.body}
              placeholder="Edit message"
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSend={async (body) => {
                await edit({ messageId: m._id, body });
                setEditing(false);
              }}
            />
          </div>
        ) : m.essay ? (
          <EssayPost essay={m.essay} />
        ) : m.kind === "joined" ? (
          <p className="py-1 text-[16px] text-ink-muted">
            joined Just Write 👋
          </p>
        ) : (
          <div className="text-[17px] leading-[1.5]">
            <RichText body={m.body} />
            {m.editedAt && (
              <span className="text-[12px] text-ink-muted"> (edited)</span>
            )}
          </div>
        )}

        {m.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {m.reactions.map((r) => (
              <ReactionChip
                key={r.emoji}
                emoji={r.emoji}
                memberIds={r.memberIds}
                onClick={() => toggle({ messageId: m._id, emoji: r.emoji })}
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
          className={`absolute -top-3.5 right-[clamp(16px,3vw,32px)] z-10 items-center border border-ink/15 bg-cream shadow-[0_4px_12px_-6px_rgb(56_33_63/0.3)] ${
            picker || confirmDelete
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
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </span>
          ) : picker ? (
            <span
              className="flex items-center"
              onMouseLeave={() => setPicker(false)}
            >
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`React ${e}`}
                  className="cursor-pointer px-1.5 py-1 text-[19px] transition-transform hover:scale-125"
                  onClick={() => {
                    void toggle({ messageId: m._id, emoji: e });
                    setPicker(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </span>
          ) : (
            <>
              {REACTIONS.slice(0, 3).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`React ${e}`}
                  className="cursor-pointer px-1.5 py-1 text-[17px] transition-transform hover:scale-125"
                  onClick={() => toggle({ messageId: m._id, emoji: e })}
                >
                  {e}
                </button>
              ))}
              <ActionButton
                label="More reactions"
                onClick={() => setPicker(true)}
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
              {!inThread && onOpenThread && (
                <ActionButton
                  label="Reply in thread"
                  onClick={() => onOpenThread(m._id)}
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
              {mine && !m.essay && !m.kind && (
                <ActionButton label="Edit" onClick={() => setEditing(true)}>
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
      title={`${names.join(", ")} reacted ${emoji}`}
      aria-pressed={mine}
      className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[14px] tabular-nums transition-colors motion-safe:animate-[pop_250ms_ease-out] ${
        mine
          ? "border-brass bg-brass/15 text-brass-text"
          : "border-ink/15 bg-cream hover:border-ink/40"
      }`}
    >
      <span className="text-[15px]">{emoji}</span>
      {memberIds.length}
    </button>
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
