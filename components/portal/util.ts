"use client";

import { useSyncExternalStore } from "react";

// The current time, re-rendering every `ms` milliseconds. Null during SSR.
export function useNow(ms = 30_000) {
  return useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, ms);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / ms) * ms,
    () => null,
  );
}

// Optimistic chat messages get an id starting with this until the server saves them.
export const PENDING = "pending:";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function timeAgo(t: number, now: number) {
  const s = Math.round((t - now) / 1000);
  if (Math.abs(s) < 45) return "just now";
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  const d = Math.round(h / 24);
  if (Math.abs(d) < 7) return rtf.format(d, "day");
  return dayFmt.format(t);
}

export function clockTime(t: number) {
  return timeFmt.format(t);
}

export function dayLabel(t: number, now: number) {
  const d = new Date(t);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A little burst of confetti from an element, in the site's colors. Skipped for reduced motion.
export function confetti(from: Element | null) {
  if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  const r = from.getBoundingClientRect();
  const colors = ["#f66e5e", "#ff8878", "#ab90b3", "#38213f", "#e7a46a"];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement("span");
    const size = 5 + Math.random() * 6;
    Object.assign(el.style, {
      position: "fixed",
      left: `${r.left + r.width / 2}px`,
      top: `${r.top + r.height / 2}px`,
      width: `${size}px`,
      height: `${size * (Math.random() > 0.5 ? 1 : 2.2)}px`,
      background: colors[i % colors.length],
      pointerEvents: "none",
      zIndex: "100",
      borderRadius: Math.random() > 0.6 ? "50%" : "0",
    });
    document.body.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    el.animate(
      [
        { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist - 60}px)) rotate(${Math.random() * 720}deg)`,
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: `translate(calc(-50% + ${Math.cos(angle) * dist * 1.1}px), calc(-50% + ${Math.sin(angle) * dist + 80}px)) rotate(${Math.random() * 900}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 1100 + Math.random() * 500,
        easing: "cubic-bezier(.2,.7,.3,1)",
      },
    ).onfinish = () => el.remove();
  }
}
