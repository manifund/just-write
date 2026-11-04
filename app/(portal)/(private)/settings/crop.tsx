"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIEW = 280; // crop window size in px
const MAX_ZOOM = 4;

type Crop = { zoom: number; x: number; y: number };

// Lets the member drag and zoom a photo inside a circle before uploading it.
// `file` is a picked file or the URL of their current photo. `onSave` gets a
// square JPEG of what's inside the circle.
export function PhotoCrop({
  file,
  onCancel,
  onSave,
  onChooseFile,
  size = 400,
}: {
  file: Blob | string;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
  onChooseFile?: () => void;
  size?: number;
}) {
  const [image, setImage] = useState<{
    bitmap: ImageBitmap;
    url: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: { bitmap: ImageBitmap; url: string } | null = null;
    const blob =
      typeof file === "string"
        ? fetch(file, { referrerPolicy: "no-referrer" }).then((r) => {
            if (!r.ok) throw new Error();
            return r.blob();
          })
        : Promise.resolve(file);
    blob.then(async (b) => [b, await createImageBitmap(b)] as const).then(
      ([b, bitmap]) => {
        loaded = { bitmap, url: URL.createObjectURL(b) };
        if (cancelled) return cleanup();
        const base = VIEW / Math.min(bitmap.width, bitmap.height);
        setCrop({
          zoom: 1,
          x: (VIEW - bitmap.width * base) / 2,
          y: (VIEW - bitmap.height * base) / 2,
        });
        setImage(loaded);
      },
      () =>
        !cancelled &&
        setError(
          typeof file === "string"
            ? "Couldn’t load your current photo. Choose a new one instead."
            : "Couldn’t read that image.",
        ),
    );
    function cleanup() {
      if (!loaded) return;
      loaded.bitmap.close();
      URL.revokeObjectURL(loaded.url);
    }
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [file]);

  const base = image
    ? VIEW / Math.min(image.bitmap.width, image.bitmap.height)
    : 1;

  // Keeps the image covering the whole circle.
  const clamp = useCallback(
    (c: Crop): Crop => {
      if (!image) return c;
      const s = base * c.zoom;
      const w = image.bitmap.width * s;
      const h = image.bitmap.height * s;
      return {
        zoom: c.zoom,
        x: Math.min(0, Math.max(VIEW - w, c.x)),
        y: Math.min(0, Math.max(VIEW - h, c.y)),
      };
    },
    [image, base],
  );

  // Zooms around a point in the crop window (the center by default).
  const zoomTo = useCallback(
    (zoom: number, px = VIEW / 2, py = VIEW / 2) =>
      setCrop((c) => {
        const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
        const k = z / c.zoom;
        return clamp({ zoom: z, x: px - (px - c.x) * k, y: py - (py - c.y) * k });
      }),
    [clamp],
  );

  // Wheel and trackpad pinch zoom. Attached natively so it can stop the page
  // from scrolling.
  useEffect(() => {
    const el = viewRef.current;
    if (!el || !image) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      setCrop((c) => {
        const z = Math.min(
          MAX_ZOOM,
          Math.max(1, c.zoom * Math.exp(-e.deltaY * 0.002)),
        );
        const k = z / c.zoom;
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        return clamp({ zoom: z, x: px - (px - c.x) * k, y: py - (py - c.y) * k });
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image, clamp]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function save() {
    if (!image) return;
    const s = base * crop.zoom;
    const side = VIEW / s;
    const out = Math.round(Math.min(size, side));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    canvas
      .getContext("2d")!
      .drawImage(image.bitmap, -crop.x / s, -crop.y / s, side, side, 0, 0, out, out);
    canvas.toBlob(
      (b) => (b ? onSave(b) : setError("Couldn’t read that image.")),
      "image/jpeg",
      0.88,
    );
  }

  const s = base * crop.zoom;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crop photo"
        className="flex w-full max-w-[22rem] flex-col items-center gap-5 bg-cream p-6"
      >
        <h2 className="self-start text-[13px] tracking-[0.12em] text-ink-muted uppercase">
          Crop photo
        </h2>
        <div
          ref={viewRef}
          tabIndex={0}
          aria-label="Drag to move the photo. Use arrow keys to move it."
          className="relative shrink-0 cursor-grab touch-none overflow-hidden bg-ink/10 select-none active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            drag.current = { id: d.id, x: e.clientX, y: e.clientY };
            setCrop((c) => clamp({ ...c, x: c.x + dx, y: c.y + dy }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = 10;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [step, 0],
              ArrowRight: [-step, 0],
              ArrowUp: [0, step],
              ArrowDown: [0, -step],
            };
            const m = moves[e.key];
            if (!m) return;
            e.preventDefault();
            setCrop((c) => clamp({ ...c, x: c.x + m[0], y: c.y + m[1] }));
          }}
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked file
            <img
              src={image.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                left: crop.x,
                top: crop.y,
                width: image.bitmap.width * s,
                height: image.bitmap.height * s,
              }}
            />
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(56_33_63/0.45)] ring-1 ring-cream/70"
          />
        </div>
        <label className="flex w-full items-center gap-3 text-[14px] text-ink-muted">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            disabled={!image}
            onChange={(e) => zoomTo(Number(e.target.value))}
            className="w-full accent-ink"
          />
        </label>
        {error && (
          <p role="alert" className="text-[14px] text-brass-text">
            {error}
          </p>
        )}
        <div className="flex w-full items-center justify-end gap-3">
          {onChooseFile && (
            <button
              type="button"
              onClick={onChooseFile}
              className="mr-auto cursor-pointer text-[14px] text-ink-muted underline-offset-2 hover:underline"
            >
              Choose new photo
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] cursor-pointer border border-ink/28 px-5 text-[16px] transition-colors hover:bg-ink/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!image}
            className="min-h-[44px] cursor-pointer bg-ink px-5 text-[16px] text-cream transition-colors hover:bg-ink-muted disabled:opacity-60"
          >
            Save photo
          </button>
        </div>
      </div>
    </div>
  );
}
