// Builds a full palette from two picked colors: a base (the ink) and an
// accent (the brass). Each role sits at a fixed OKLCH lightness taken from the
// hand-made palettes in options.ts, so text contrast holds whatever is picked;
// only hue and chroma come from the picks.

import type { Palette } from "./options";

type Oklch = { l: number; c: number; h: number };

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** "#AbC123" or "abc123" → "#abc123", or null if it isn't a 6-digit hex. */
export function normalizeHex(value: unknown): string | null {
  const m = typeof value === "string" ? HEX_RE.exec(value.trim()) : null;
  return m ? `#${m[1].toLowerCase()}` : null;
}

function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Converts to hex, lowering chroma (not lightness) until it fits in sRGB. */
function toHex(color: Oklch): string {
  let { c } = color;
  if (!inGamut(oklchToRgb(color))) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToRgb({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  return (
    "#" +
    oklchToRgb({ ...color, c })
      .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function derivePalette(baseHex: string, accentHex: string): Palette {
  const base = hexToOklch(baseHex);
  const accent = hexToOklch(accentHex);

  // Near-grey picks have a meaningless hue; keep them grey instead of tinting.
  const bc = clamp(base.c, 0, 0.13);
  const ac = clamp(accent.c, 0, 0.17);
  const at = (l: number, c: number, h: number) => toHex({ l, c, h });

  // The paper takes a faint tint of the accent, like the presets' warm creams.
  // A grey accent has no real hue, so fall back to a plain warm paper.
  const greyAccent = ac < 0.02;
  const paperC = greyAccent ? 0.008 : Math.min(0.012, ac * 0.12 + 0.004);
  const paperH = greyAccent ? 80 : accent.h;

  // Accent keeps its own lightness within the range that reads on the ink panel.
  const al = clamp(accent.l, 0.7, 0.82);

  return {
    cream: at(0.958, paperC, paperH),
    "cream-deep": at(0.92, paperC * 1.6, paperH),
    ink: at(clamp(base.l, 0.24, 0.32), bc, base.h),
    "ink-muted": at(0.46, bc * 0.85, base.h),
    wash: at(0.69, clamp(bc * 0.95, 0, 0.09), base.h),
    "wash-light": at(0.88, clamp(bc * 0.4, 0, 0.035), base.h),
    brass: at(al, ac, accent.h),
    "brass-light": at(al + 0.055, ac * 0.93, accent.h),
    "brass-numeral": at(0.58, ac * 0.82, accent.h),
    "brass-text": at(0.5, ac * 0.7, accent.h),
  };
}
