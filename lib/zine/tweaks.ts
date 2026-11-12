// Design settings for the magazine. /zine edits them; scripts/zine-pdf.ts takes them as
// JSON. lib/zine/document.ts turns an issue plus these into a Paged.js document.

export const TRIMS = {
  "6x9": { label: "6 × 9 in (digest)", w: 6, h: 9 },
  "7x10": { label: "7 × 10 in", w: 7, h: 10 },
  "8.5x11": { label: "8.5 × 11 in (letter)", w: 8.5, h: 11 },
} as const;

// Google Fonts families. `spec` is the axis list in the css2 URL; each must only name
// styles the family has, or the API refuses the whole request.
export const BODY_FONTS = {
  garamond: { name: "EB Garamond", spec: "ital,wght@0,400..800;1,400..800", scale: 1.08 },
  sourceSerif: { name: "Source Serif 4", spec: "ital,opsz,wght@0,8..60,200..900;1,8..60,200..900", scale: 1 },
  newsreader: { name: "Newsreader", spec: "ital,opsz,wght@0,6..72,200..800;1,6..72,200..800", scale: 1.02 },
  literata: { name: "Literata", spec: "ital,opsz,wght@0,7..72,200..900;1,7..72,200..900", scale: 0.96 },
  crimson: { name: "Crimson Pro", spec: "ital,wght@0,200..900;1,200..900", scale: 1.1 },
  spectral: { name: "Spectral", spec: "ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600", scale: 0.98 },
  caslon: { name: "Libre Caslon Text", spec: "ital,wght@0,400;0,700;1,400", scale: 0.92 },
  lora: { name: "Lora", spec: "ital,wght@0,400..700;1,400..700", scale: 0.98 },
  atkinson: { name: "Atkinson Hyperlegible Next", spec: "ital,wght@0,200..800;1,200..800", scale: 0.95 },
} as const;

export const DISPLAY_FONTS = {
  body: { name: "", spec: "", label: "Same as body" },
  fraunces: { name: "Fraunces", spec: "ital,opsz,wght@0,9..144,100..900;1,9..144,100..900" },
  playfair: { name: "Playfair Display", spec: "ital,wght@0,400..900;1,400..900" },
  instrument: { name: "Instrument Serif", spec: "ital@0;1" },
  dmSerif: { name: "DM Serif Display", spec: "ital@0;1" },
  bodoni: { name: "Bodoni Moda", spec: "ital,opsz,wght@0,6..96,400..900;1,6..96,400..900" },
  cormorant: { name: "Cormorant Garamond", spec: "ital,wght@0,300..700;1,300..700" },
  interTight: { name: "Inter Tight", spec: "ital,wght@0,100..900;1,100..900" },
  spaceGrotesk: { name: "Space Grotesk", spec: "wght@300..700" },
} as const;

// ink: text; accent: drop caps, kickers, end marks, folios; cover: the cover's ground.
export const PALETTES = {
  justWrite: { label: "Just Write", ink: "#2a1830", accent: "#bf5548", cover: "#38213f", coverInk: "#f9eeec" },
  black: { label: "Black", ink: "#151515", accent: "#151515", cover: "#151515", coverInk: "#f4f1ea" },
  oxblood: { label: "Oxblood", ink: "#1c1a19", accent: "#7d2027", cover: "#5e1a1f", coverInk: "#f3ebe1" },
  navy: { label: "Navy", ink: "#141b2a", accent: "#24508f", cover: "#16233d", coverInk: "#eef0f2" },
  forest: { label: "Forest", ink: "#18221d", accent: "#2f6b4f", cover: "#1f3b2e", coverInk: "#eef0e6" },
  ochre: { label: "Ochre", ink: "#211d17", accent: "#a8741a", cover: "#e9dcc0", coverInk: "#211d17" },
} as const;

export type Tweaks = {
  trim: keyof typeof TRIMS;
  bleed: boolean; // add 0.125in on each side, as printers want for full-bleed pages
  bodyFont: keyof typeof BODY_FONTS;
  displayFont: keyof typeof DISPLAY_FONTS;
  size: number; // body size, pt
  leading: number; // line-height
  titleScale: number;
  titleItalic: boolean;
  margins: number; // 0.8–1.3 times the trim's base margins (never below the printers' safe area)
  columns: 1 | 2;
  paragraphs: "indent" | "spaced";
  justify: boolean;
  dropCap: 0 | 2 | 3;
  opener: "classic" | "left" | "titlePage";
  palette: keyof typeof PALETTES;
  runningHeads: boolean;
  folio: "outer" | "center";
  startRight: boolean; // each essay opens on a right-hand page
  images: "color" | "gray" | "none";
  endMark: "none" | "square" | "asterism" | "fleuron";
  cover: boolean;
  contents: boolean;
  order: "submitted" | "author" | "length";
  // "full", or about this many pages of each essay followed by a QR code to the rest.
  length: "full" | 2 | 3 | 4;
  // QR codes to the essay online: on every essay, only on essays cut short, or never.
  qr: "all" | "overflow" | "none";
  limit: number | null; // only the first n essays (after order and exclusions); null for all
  exclude: string[]; // essay ids left out
};

// The House design. Presets are written as changes to it.
export const HOUSE_TWEAKS: Tweaks = {
  trim: "6x9",
  bleed: true,
  bodyFont: "newsreader",
  displayFont: "fraunces",
  size: 10.5,
  leading: 1.42,
  titleScale: 1,
  titleItalic: false,
  margins: 1,
  columns: 1,
  paragraphs: "indent",
  justify: true,
  dropCap: 3,
  opener: "classic",
  palette: "justWrite",
  runningHeads: true,
  folio: "outer",
  startRight: false,
  images: "gray",
  endMark: "square",
  cover: true,
  contents: true,
  order: "submitted",
  length: "full",
  qr: "all",
  limit: 10,
  exclude: [],
};

// Austin's pick, and the default for /zine and scripts/zine-pdf.ts.
const AUSTINS_CUT: Partial<Tweaks> = {
  trim: "8.5x11",
  columns: 2,
  bodyFont: "literata",
  size: 9.5,
  paragraphs: "spaced",
  justify: false, // also turns hyphenation off
  images: "color",
  qr: "all",
};

export const DEFAULT_TWEAKS: Tweaks = { ...HOUSE_TWEAKS, ...AUSTINS_CUT };

export const PRESETS: { label: string; tweaks: Partial<Tweaks> }[] = [
  { label: "Austin's cut", tweaks: AUSTINS_CUT },
  { label: "House", tweaks: {} },
  {
    label: "Literary",
    tweaks: {
      bodyFont: "garamond",
      displayFont: "body",
      size: 11,
      leading: 1.38,
      titleItalic: true,
      opener: "titlePage",
      palette: "black",
      dropCap: 0,
      endMark: "fleuron",
      startRight: true,
    },
  },
  {
    label: "Quarterly",
    tweaks: {
      bodyFont: "caslon",
      displayFont: "instrument",
      size: 9.75,
      leading: 1.45,
      titleScale: 1.25,
      opener: "left",
      palette: "oxblood",
      dropCap: 2,
      endMark: "asterism",
    },
  },
  {
    label: "Broadsheet",
    tweaks: {
      trim: "8.5x11",
      bodyFont: "sourceSerif",
      displayFont: "interTight",
      size: 9.5,
      leading: 1.4,
      columns: 2,
      opener: "left",
      palette: "navy",
      paragraphs: "indent",
      dropCap: 2,
    },
  },
];

// Fills in anything missing or invalid (old saved settings, hand-written JSON).
export function readTweaks(raw: unknown): Tweaks {
  const t = { ...DEFAULT_TWEAKS };
  if (!raw || typeof raw !== "object") return t;
  const r = raw as Record<string, unknown>;
  const pick = <K extends keyof Tweaks>(k: K, ok: (v: unknown) => boolean) => {
    if (ok(r[k])) t[k] = r[k] as Tweaks[K];
  };
  const oneOf = (xs: readonly unknown[]) => (v: unknown) => xs.includes(v);
  const num = (lo: number, hi: number) => (v: unknown) =>
    typeof v === "number" && v >= lo && v <= hi;
  const bool = (v: unknown) => typeof v === "boolean";
  pick("trim", oneOf(Object.keys(TRIMS)));
  pick("bleed", bool);
  pick("bodyFont", oneOf(Object.keys(BODY_FONTS)));
  pick("displayFont", oneOf(Object.keys(DISPLAY_FONTS)));
  pick("size", num(8, 14));
  pick("leading", num(1.1, 1.8));
  pick("titleScale", num(0.6, 1.8));
  pick("titleItalic", bool);
  pick("margins", num(0.8, 1.3));
  pick("columns", oneOf([1, 2]));
  pick("paragraphs", oneOf(["indent", "spaced"]));
  pick("justify", bool);
  pick("dropCap", oneOf([0, 2, 3]));
  pick("opener", oneOf(["classic", "left", "titlePage"]));
  pick("palette", oneOf(Object.keys(PALETTES)));
  pick("runningHeads", bool);
  pick("folio", oneOf(["outer", "center"]));
  pick("startRight", bool);
  pick("images", oneOf(["color", "gray", "none"]));
  pick("endMark", oneOf(["none", "square", "asterism", "fleuron"]));
  pick("cover", bool);
  pick("contents", bool);
  pick("order", oneOf(["submitted", "author", "length"]));
  pick("length", oneOf(["full", 2, 3, 4]));
  pick("qr", oneOf(["all", "overflow", "none"]));
  pick("limit", (v) => v === null || (typeof v === "number" && v >= 0 && v <= 1000));
  pick("exclude", (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  return t;
}

// Base margins per trim, in inches, before the `margins` factor. The inside margin includes
// room for a perfect-bound gutter (Lulu: 0.625in total for 61–150 pages).
const BASE_MARGINS = {
  "6x9": { top: 0.72, bottom: 0.85, inside: 0.8, outside: 0.62 },
  "7x10": { top: 0.8, bottom: 0.95, inside: 0.88, outside: 0.7 },
  "8.5x11": { top: 0.85, bottom: 1, inside: 0.95, outside: 0.75 },
} as const;

export function margins(t: Tweaks) {
  const b = BASE_MARGINS[t.trim];
  const f = t.margins;
  return {
    top: Math.max(0.5, b.top * f),
    bottom: Math.max(0.6, b.bottom * f),
    inside: Math.max(0.625, b.inside * f),
    outside: Math.max(0.5, b.outside * f),
  };
}

// Rough words per full page of body text, for cutting excerpts to a page count.
export function wordsPerPage(t: Tweaks) {
  const trim = TRIMS[t.trim];
  const m = margins(t);
  const size = t.size * BODY_FONTS[t.bodyFont].scale;
  const widthPt = (trim.w - m.inside - m.outside) * 72;
  const heightPt = (trim.h - m.top - m.bottom) * 72;
  const charsPerLine = widthPt / (size * 0.48);
  const lines = heightPt / (size * t.leading);
  return (charsPerLine * lines) / 6;
}

// Lulu's paperback spine formula, as a rough guide (each printer's calculator is final).
export const spineInches = (pages: number) => pages / 444 + 0.06;
