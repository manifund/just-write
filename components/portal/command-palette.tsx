"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { api } from "@/convex/_generated/api";
import { pushChatUrl, useChatUrl } from "@/lib/chat-url";
import type { PublicMember } from "@/convex/lib/viewer";
import { usePortal } from "./context";
import { profilePath, timeAgo, useNow } from "./util";

// The numbered sections of the portal, in sidebar order. Cmd/Ctrl+1–9 go to them.
export type Section = { href: string; label: string; icon: string };
export function portalSections(isAdmin: boolean): Section[] {
  return [
    { href: "/home", label: "Home", icon: "✦" },
    { href: "/activity", label: "Activity", icon: "@" },
    { href: "/calendar", label: "Calendar", icon: "◫" },
    { href: "/ideas", label: "Ideas", icon: "☆" },
    { href: "/themes", label: "Themes", icon: "¶" },
    { href: "/zine", label: "Zine", icon: "❡" },
    { href: "/members", label: "Members", icon: "◎" },
    ...(isAdmin
      ? [
          { href: "/admin", label: "Admin", icon: "⚙" },
          { href: "/improvements", label: "Improvements", icon: "✳" },
        ]
      : []),
  ];
}

export const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// Text fields where Option/Alt+key types characters (Option+3 is # on a UK Mac).
const typingIn = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || !!el.closest("input, textarea, select"));
const typingInForm = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest("input, textarea, select");

type Item = {
  key: string;
  href: string;
  label: string;
  icon: string;
  kind: string; // shown on the right
  search: string; // lowercase text to match
  unread?: boolean;
  detail?: string; // a second line, for message matches
  fill?: string; // picking it puts this in the box instead of opening href
};

// "from:name" (or "from: name") anywhere in the box limits message search to one
// person. Returns the name typed after it and the rest of the query, or null.
const FROM = /(^|\s)from:\s*@?(\S*)/i;
function readFrom(q: string) {
  const m = FROM.exec(q);
  if (!m) return null;
  const rest = (q.slice(0, m.index) + m[1] + q.slice(m.index + m[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { name: m[2].toLowerCase(), rest };
}
// What "from:" takes for a member: their handle, or their name without spaces.
const fromToken = (m: PublicMember) =>
  (m.handle ?? m.name.replace(/\s+/g, "")).toLowerCase();

// Opens with Cmd/Ctrl+K (or the sidebar's "Jump to" button) and lists sections,
// channels, and members, then messages whose text matches (chat.search). Also handles the portal's other shortcuts:
// Cmd/Ctrl+1–9 (or Alt+1–9 outside text fields) for sections, Alt+↑/↓ for the
// previous/next channel, and Alt+Shift+↑/↓ for the previous/next unread channel.
export function CommandPalette({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { viewer, roster } = usePortal();
  const channels = useQuery(api.chat.channels);
  const { pathname } = useChatUrl();
  const router = useRouter();
  const sections = useMemo(
    () => portalSections(viewer.isAdmin),
    [viewer.isAdmin],
  );

  // From one chat page to another, switch in place like sidebar links do (lib/chat-url.ts).
  const go = useCallback(
    (href: string) => {
      const here = window.location.pathname + window.location.search;
      if (href.startsWith("/chat/") && here.startsWith("/chat/")) {
        if (href !== here) pushChatUrl(href);
      } else router.push(href);
    },
    [router],
  );

  // Keep the latest values for the window listener without re-adding it.
  const state = useRef({ open, sections, channels, pathname, go });
  useEffect(() => {
    state.current = { open, sections, channels, pathname, go };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const { sections, channels, pathname, go } = state.current;
      const mod = isMac() ? e.metaKey : e.ctrlKey;

      if (mod && !e.altKey && !e.shiftKey && (e.key ?? "").toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!state.current.open);
        return;
      }

      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && !e.shiftKey) {
        const viaMod = mod && !e.altKey;
        const viaAlt =
          e.altKey && !e.metaKey && !e.ctrlKey && !typingIn(e.target);
        if (!viaMod && !viaAlt) return;
        const section = sections[Number(digit[1]) - 1];
        if (!section) return;
        e.preventDefault();
        setOpen(false);
        go(section.href);
        return;
      }

      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !state.current.open &&
        !typingInForm(e.target) &&
        channels?.length
      ) {
        const step = e.key === "ArrowDown" ? 1 : -1;
        const at = channels.findIndex((c) => pathname === `/chat/${c.slug}`);
        const n = channels.length;
        let next = -1;
        for (let i = 1; i <= n; i++) {
          // From outside chat, Down starts at the first channel and Up at the last.
          const j = at === -1 ? (step === 1 ? i - 1 : n - i) : at + step * i;
          const idx = ((j % n) + n) % n;
          if (idx === at) break;
          // With Shift, skip channels with nothing new.
          if (!e.shiftKey || channels[idx].unread) {
            next = idx;
            break;
          }
        }
        if (next === -1) return;
        e.preventDefault();
        go(`/chat/${channels[next].slug}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const items = useMemo(() => {
    const mac = isMac();
    const list: Item[] = sections.map((s, i) => ({
      key: s.href,
      href: s.href,
      label: s.label,
      icon: s.icon,
      kind: i < 9 ? `${mac ? "⌘" : "Ctrl+"}${i + 1}` : "",
      search: s.label.toLowerCase(),
    }));
    list.push({
      key: "/settings",
      href: "/settings",
      label: "Settings",
      icon: "○",
      kind: "",
      search: "settings profile notifications",
    });
    for (const c of channels ?? [])
      list.push({
        key: `c:${c._id}`,
        href: `/chat/${c.slug}`,
        label: c.name,
        icon: "#",
        kind: "Channel",
        search: `${c.name} ${c.slug}`.toLowerCase(),
        unread: c.unread,
      });
    const members = [...roster.values()]
      .filter((m) => !m.bot && profilePath(m))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const m of members)
      list.push({
        key: `m:${m._id}`,
        href: profilePath(m)!,
        label: m.name,
        icon: "◎",
        kind: `@${m.handle}`,
        search: `${m.name} ${m.handle}`.toLowerCase(),
      });
    return list;
  }, [sections, channels, roster]);

  if (!open) return null;
  return (
    <Dialog
      items={items}
      onClose={() => setOpen(false)}
      onPick={(href) => {
        setOpen(false);
        go(href);
      }}
    />
  );
}

// How well an item matches: lower is better, null for no match.
function score(item: Item, q: string): number | null {
  if (!q) return item.kind.startsWith("@") ? null : 0; // members only when searching
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 0;
  if (item.search.split(/[\s-]+/).some((w) => w.startsWith(q))) return 1;
  if (item.search.includes(q)) return 2;
  // Letters in order, e.g. "gnrl" for general.
  let i = 0;
  for (const ch of item.search) if (ch === q[i]) i++;
  return i === q.length ? 3 : null;
}

function Dialog({
  items,
  onClose,
  onPick,
}: {
  items: Item[];
  onClose: () => void;
  onPick: (href: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { roster } = usePortal();
  const now = useNow();
  const q = query.trim().toLowerCase();
  // "from:name": who it could mean, and who it means once there's one clear match.
  const filter = useMemo(() => {
    const f = readFrom(q);
    if (!f) return null;
    const people = [...roster.values()]
      .filter((m) => {
        if (!f.name) return !m.bot;
        const words = m.name.toLowerCase().split(/\s+/);
        return (
          fromToken(m).startsWith(f.name) ||
          words.some((w) => w.startsWith(f.name))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const exact = people.find((m) => fromToken(m) === f.name);
    const who = exact ?? (people.length === 1 && f.name ? people[0] : null);
    return { ...f, people, who };
  }, [q, roster]);
  // Message search waits for a pause in typing.
  const [searchFor, setSearchFor] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchFor(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  const args = useMemo(() => {
    if (!filter) return searchFor.length >= 2 ? { q: searchFor } : null;
    if (!filter.who) return null;
    const rest = readFrom(searchFor)?.rest;
    if (rest === undefined || (rest.length > 0 && rest.length < 2)) return null;
    return { q: rest, from: filter.who._id };
  }, [filter, searchFor]);
  const found = useQuery(api.chat.search, args ?? "skip");
  const searching = !!args && (searchFor !== q || found === undefined);
  const shown = useMemo(() => {
    const list: Item[] = [];
    if (filter) {
      // Until it's clear who, list the people it could be; picking one fills it in.
      if (!filter.who)
        for (const m of filter.people.slice(0, 8))
          list.push({
            key: `from:${m._id}`,
            href: "",
            label: m.name,
            icon: "◎",
            kind: `from:${fromToken(m)}`,
            search: "",
            fill: `${filter.rest ? `${filter.rest} ` : ""}from:${fromToken(m)} `,
          });
    } else
      list.push(
        ...items
          .map((item, i) => ({ item, i, s: score(item, q) }))
          .filter((x) => x.s !== null)
          .sort((a, b) => a.s! - b.s! || a.i - b.i)
          .map((x) => x.item),
      );
    if (!args || searchFor !== q) return list;
    for (const m of found ?? [])
      list.push({
        key: `msg:${m._id}`,
        href: m.href,
        label: m.snippet,
        icon: "“",
        kind: "",
        search: "",
        detail: `${roster.get(m.authorId)?.name ?? "Someone"} ${
          m.reply ? "replied" : ""
        } in #${m.channel}${now ? ` · ${timeAgo(m._creationTime, now)}` : ""}`.replace(
          /\s+/g,
          " ",
        ),
      });
    return list;
  }, [items, q, filter, args, searchFor, found, roster, now]);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  // Put focus back where it was when the palette closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const pick = (item: Item) => {
    if (item.fill !== undefined) {
      setQuery(item.fill);
      setActive(0);
      inputRef.current?.focus();
    } else onPick(item.href);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      setActive(shown.length ? (current + 1) % shown.length : 0);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setActive(
        shown.length ? (current - 1 + shown.length) % shown.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = shown[current];
      if (item) pick(item);
    }
  };

  const mac = isMac();
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh]"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-[34rem] flex-col border border-ink/20 bg-cream text-ink shadow-[0_8px_24px_-8px_rgb(56_33_63/0.35)]"
      >
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a page, channel, member, or message"
          aria-label="Jump to"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={
            shown[current] ? `command-palette-${current}` : undefined
          }
          className="w-full border-b border-ink/15 bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-ink-muted"
        />
        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {shown.length === 0 && (
            <li className="px-4 py-3 text-[15px] text-ink-muted">
              {searching
                ? "Searching messages…"
                : filter?.who && args
                  ? `No messages from ${filter.who.name} match.`
                  : filter && !filter.who && !filter.people.length
                    ? "No one by that name."
                    : "Nothing matches."}
            </li>
          )}
          {shown.map((item, i) => (
            <li
              key={item.key}
              id={`command-palette-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => i !== current && setActive(i)}
              onClick={() => pick(item)}
              className={`flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-[16px] ${
                i === current ? "bg-ink/8" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-5 shrink-0 text-center text-ink-muted ${item.detail ? "self-start" : ""}`}
              >
                {item.icon}
              </span>
              {item.detail ? (
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-[15px]">
                    {item.label}
                  </span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {item.detail}
                  </span>
                </span>
              ) : (
                <span
                  className={`min-w-0 truncate ${item.unread ? "font-bold" : ""}`}
                >
                  {item.label}
                </span>
              )}
              {item.unread && (
                <span
                  className="size-2 shrink-0 rounded-full bg-brass"
                  aria-label="unread"
                />
              )}
              {item.kind && (
                <span className="ml-auto shrink-0 pl-3 text-[13px] text-ink-muted">
                  {item.kind}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="hidden border-t border-ink/15 px-4 py-2 text-[13px] text-ink-muted sm:block">
          ↑↓ to move, Enter to open. Anywhere: {mac ? "⌘" : "Ctrl+"}1–9 for
          sections, {mac ? "⌥" : "Alt+"}↑↓ for channels, {mac ? "⌥⇧" : "Alt+Shift+"}↑↓
          for unread ones. Type from:name to search one person’s messages.
        </p>
      </div>
    </div>,
    document.body,
  );
}
