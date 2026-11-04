"use client";

// Optimistic updates: change what's on screen right away while the mutation runs.
// Convex rolls these back on its own once the server answers (or if it fails).

import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatMessage } from "@/convex/chat";
import { cleanBody } from "@/convex/lib/richtext";

// Applies `fn` to every loaded copy of every message (channel pages, the sidebar's
// recent lists, open threads). `fn` returns the new message, or null to drop it.
function updateMessages(
  store: OptimisticLocalStore,
  fn: (m: ChatMessage) => ChatMessage | null,
) {
  const map = (list: ChatMessage[]) => {
    let changed = false;
    const out: ChatMessage[] = [];
    for (const m of list) {
      const next = fn(m);
      if (next !== m) changed = true;
      if (next) out.push(next);
    }
    return changed ? out : list;
  };

  for (const { args, value } of store.getAllQueries(api.chat.messages)) {
    if (!value) continue;
    const page = map(value.page);
    if (page !== value.page)
      store.setQuery(api.chat.messages, args, { ...value, page });
  }
  for (const { args, value } of store.getAllQueries(api.chat.recent)) {
    if (!value) continue;
    const messages = map(value.messages);
    if (messages !== value.messages)
      store.setQuery(api.chat.recent, args, { ...value, messages });
  }
  for (const { args, value } of store.getAllQueries(api.chat.thread)) {
    if (!value) continue;
    const parent = fn(value.parent);
    const replies = map(value.replies);
    if (parent !== value.parent || replies !== value.replies)
      store.setQuery(
        api.chat.thread,
        args,
        parent ? { parent, replies } : null,
      );
  }
}

export function useToggleReaction(memberId: Id<"members">) {
  return useMutation(api.chat.toggleReaction).withOptimisticUpdate(
    (store, { messageId, emoji }) =>
      updateMessages(store, (m) => {
        if (m._id !== messageId) return m;
        const has = m.reactions.find((r) => r.emoji === emoji);
        const reactions = !has
          ? [...m.reactions, { emoji, memberIds: [memberId] }]
          : has.memberIds.includes(memberId)
            ? m.reactions
                .map((r) =>
                  r.emoji === emoji
                    ? {
                        ...r,
                        memberIds: r.memberIds.filter((id) => id !== memberId),
                      }
                    : r,
                )
                .filter((r) => r.memberIds.length > 0)
            : m.reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, memberIds: [...r.memberIds, memberId] }
                  : r,
              );
        return { ...m, reactions };
      }),
  );
}

export function useEditMessage() {
  return useMutation(api.chat.edit).withOptimisticUpdate(
    (store, { messageId, body: raw }) => {
      let cleaned: { body: string; text: string };
      try {
        cleaned = cleanBody(raw);
      } catch {
        return; // the server will reject it with a proper error
      }
      if (!cleaned.text) return;
      updateMessages(store, (m) =>
        m._id === messageId
          ? { ...m, ...cleaned, editedAt: Date.now() }
          : m,
      );
    },
  );
}

export function useRemoveMessage() {
  return useMutation(api.chat.remove).withOptimisticUpdate(
    (store, { messageId }) => {
      let parentId: Id<"messages"> | undefined;
      updateMessages(store, (m) => {
        if (m._id === messageId) parentId ??= m.parentId;
        return m;
      });
      updateMessages(store, (m) => {
        // The message, and its replies along with it.
        if (m._id === messageId || m.parentId === messageId) return null;
        if (parentId && m._id === parentId)
          return { ...m, replyCount: Math.max(0, (m.replyCount ?? 1) - 1) };
        return m;
      });
    },
  );
}

// Idea votes show up on the ideas board, your own ideas, and members' profiles.
export function useToggleVote() {
  return useMutation(api.ideas.toggleVote).withOptimisticUpdate(
    (store, { ideaId }) => {
      const flip = <T extends { _id: Id<"ideas">; votes: number; voted: boolean }>(
        list: T[],
      ) =>
        list.map((i) =>
          i._id === ideaId
            ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) }
            : i,
        );
      for (const { args, value } of store.getAllQueries(api.ideas.board))
        if (value) store.setQuery(api.ideas.board, args, flip(value));
      for (const { args, value } of store.getAllQueries(api.ideas.mine))
        if (value) store.setQuery(api.ideas.mine, args, flip(value));
      for (const { args, value } of store.getAllQueries(api.ideas.forMember))
        if (value) store.setQuery(api.ideas.forMember, args, flip(value));
    },
  );
}
