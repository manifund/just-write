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
import { usePortal } from "./context";
import { profilePath } from "./util";

// The numbered sections of the portal, in sidebar order. Cmd/Ctrl+1–9 go to them.
export type Section = { href: string; label: string; icon: string };
export function portalSections(isAdmin: boolean): Section[] {
  return [
    { href: "/home", label: "Home", icon: "✦" },
    { href: "/activity", label: "Activity", icon: "@" },
    { href: "/calendar", label: "Calendar", icon: "◫" },
    { href: "/ideas", label: "Ideas", icon: "☆" },
    { href: "/themes", label: "Themes", icon: "¶" },
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
};

// Opens with Cmd/Ctrl+K (or the sidebar's "Jump to" button) and lists sections,
// channels, and members. Also handles the portal's other shortcuts:
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
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      items
        .map((item, i) => ({ item, i, s: score(item, q) }))
        .filter((x) => x.s !== null)
        .sort((a, b) => a.s! - b.s! || a.i - b.i)
        .map((x) => x.item),
    [items, q],
  );
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
      if (item) onPick(item.href);
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
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to a page, channel, or member"
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
              Nothing matches.
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
              onClick={() => onPick(item.href)}
              className={`flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-[16px] ${
                i === current ? "bg-ink/8" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className="w-5 shrink-0 text-center text-ink-muted"
              >
                {item.icon}
              </span>
              <span
                className={`min-w-0 truncate ${item.unread ? "font-bold" : ""}`}
              >
                {item.label}
              </span>
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
          for unread ones.
        </p>
      </div>
    </div>,
    document.body,
  );
}
