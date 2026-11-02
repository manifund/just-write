"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { REACTIONS } from "@/convex/lib/reactions";

type Group = {
  name: string;
  slug: string;
  emojis: { emoji: string; name: string; slug: string }[];
};

// Loaded on first open so the emoji list isn't in every chat page's bundle.
let cache: Group[] | null = null;
async function loadGroups() {
  if (!cache) {
    const data = (await import("unicode-emoji-json/data-by-group.json"))
      .default as Group[];
    // Skin tone swatches aren't useful as reactions.
    cache = data.filter((g) => g.slug !== "component");
  }
  return cache;
}

const WIDTH = 312;
const GAP = 4;

export function EmojiPicker({
  anchor,
  onPick,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<Group[] | null>(cache);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Rendered into <body> with fixed positioning so the message list's scroll
  // area and the composer below it can't clip or cover it. Opens below the
  // anchor, or above it when there isn't room.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 0;
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(a.right - WIDTH, vw - WIDTH - 8));
      let top = a.bottom + GAP;
      if (top + h > vh - 8 && a.top - GAP - h >= 8) top = a.top - GAP - h;
      top = Math.max(8, Math.min(top, vh - h - 8));
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    if (!groups) void loadGroups().then(setGroups);
  }, [groups]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      // The "More reactions" button toggles the picker itself.
      if (t.closest?.("[data-emoji-toggle]")) return;
      if (ref.current && !ref.current.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !groups) return null;
    const words = q.split(/\s+/);
    return groups
      .flatMap((g) => g.emojis)
      .filter((e) => words.every((w) => e.name.includes(w)));
  }, [query, groups]);

  const button = (e: string, name: string) => (
    <button
      key={e}
      type="button"
      title={name}
      aria-label={`React ${name}`}
      className="flex size-8 cursor-pointer items-center justify-center text-[20px] transition-colors hover:bg-cream-deep"
      onClick={() => onPick(e)}
    >
      {e}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: 0, top: 0, visibility: "hidden" }
      }
      className="fixed z-50 flex w-[312px] flex-col border border-ink/15 bg-cream shadow-[0_8px_24px_-10px_rgb(56_33_63/0.4)]"
    >
      <div className="border-b border-ink/10 p-2">
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results?.[0]) onPick(results[0].emoji);
          }}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="w-full border border-ink/15 bg-white/60 px-2 py-1 text-[14px] outline-none focus:border-ink/40"
        />
      </div>
      <div className="h-[280px] overflow-y-auto p-2">
        {results ? (
          results.length > 0 ? (
            <div className="grid grid-cols-8">
              {results.map((e) => button(e.emoji, e.name))}
            </div>
          ) : (
            <p className="px-1 py-2 text-[14px] text-ink-muted">
              No emoji found.
            </p>
          )
        ) : (
          <>
            <Heading>Quick</Heading>
            <div className="grid grid-cols-8">
              {REACTIONS.map((e) => button(e, e))}
            </div>
            {groups ? (
              groups.map((g) => (
                <section key={g.slug}>
                  <Heading>{g.name}</Heading>
                  <div className="grid grid-cols-8">
                    {g.emojis.map((e) => button(e.emoji, e.name))}
                  </div>
                </section>
              ))
            ) : (
              <p className="px-1 py-2 text-[14px] text-ink-muted">Loading…</p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-1 pt-2 pb-1 text-[12px] text-ink-muted">{children}</h3>
  );
}
