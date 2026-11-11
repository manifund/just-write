"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

// A chat image that opens in a full-screen view on click. Cmd/Ctrl/middle-click
// still open the file in a new tab, since it stays a real link.
export function ChatImage({
  src,
  width,
  height,
}: {
  src: string;
  width?: number;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  return (
    <>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="block max-w-full cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads from Convex storage */}
        <img
          src={src}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          className="block h-auto max-h-80 w-auto max-w-full border border-ink/15 bg-cream-deep object-contain"
          style={
            width && height ? { aspectRatio: `${width} / ${height}` } : undefined
          }
        />
      </a>
      {open && <ImageViewer src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return createPortal(
    // Stop clicks here from reaching the message underneath (React bubbles
    // portal events through the component tree).
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image"
      className="fixed inset-0 z-50 flex flex-col bg-ink/90"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-end gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-[14px] text-cream">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-2 py-1 text-cream/80 hover:text-cream"
        >
          Open original
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="cursor-pointer px-2 py-1 text-cream/80 hover:text-cream"
        >
          Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads from Convex storage */}
        <img
          src={src}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="block max-h-full max-w-full object-contain"
        />
      </div>
    </div>,
    document.body,
  );
}
