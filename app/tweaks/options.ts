// Choices offered on /tweaks. DEFAULTS (below) is what the live site uses.

export type FontOption = {
  id: string;
  name: string;
  /** CSS variable set by next/font (see fonts.ts) */
  cssVar: string;
  /** Matches the x-height of EB Garamond so body sizes stay comparable */
  sizeAdjust?: number;
};

export const DISPLAY_FONTS: FontOption[] = [
  { id: "fraunces", name: "Fraunces", cssVar: "--font-tw-fraunces" },
  { id: "instrument", name: "Instrument Serif", cssVar: "--font-tw-instrument" },
  { id: "cormorant", name: "Cormorant", cssVar: "--font-cormorant" },
  { id: "schibsted", name: "Schibsted Grotesk", cssVar: "--font-tw-schibsted" },
];

export const BODY_FONTS: FontOption[] = [
  { id: "garamond", name: "EB Garamond", cssVar: "--font-tw-garamond" },
  { id: "newsreader", name: "Newsreader", cssVar: "--font-tw-newsreader", sizeAdjust: 0.42 },
  { id: "literata", name: "Literata", cssVar: "--font-tw-literata", sizeAdjust: 0.42 },
  { id: "atkinson", name: "Atkinson Next", cssVar: "--font-atkinson", sizeAdjust: 0.42 },
];

type Palette = {
  cream: string;
  "cream-deep": string;
  ink: string;
  "ink-muted": string;
  wash: string;
  "wash-light": string;
  brass: string;
  "brass-light": string;
  "brass-numeral": string;
  "brass-text": string;
};

export type PaletteOption = { id: string; name: string; colors: Palette };

export const PALETTES: PaletteOption[] = [
  {
    id: "ink",
    name: "Ink & brass",
    colors: {
      cream: "#f6f1e7",
      "cream-deep": "#ece5d5",
      ink: "#1f2a55",
      "ink-muted": "#4b5583",
      wash: "#8a97c2",
      "wash-light": "#c9cfe6",
      brass: "#c9a46a",
      "brass-light": "#d6b67f",
      "brass-numeral": "#9a7740",
      "brass-text": "#85662f",
    },
  },
  {
    id: "oxblood",
    name: "Oxblood",
    colors: {
      cream: "#f7f1ea",
      "cream-deep": "#efe3d8",
      ink: "#4a1b22",
      "ink-muted": "#74484d",
      wash: "#c58d91",
      "wash-light": "#edd5d2",
      brass: "#d3a24f",
      "brass-light": "#e3bb6c",
      "brass-numeral": "#a2732a",
      "brass-text": "#84601f",
    },
  },
  {
    id: "pine",
    name: "Pine & marigold",
    colors: {
      cream: "#f2f0e6",
      "cream-deep": "#e5e4d4",
      ink: "#17392f",
      "ink-muted": "#4a625a",
      wash: "#88ab9b",
      "wash-light": "#d0e1d6",
      brass: "#e2a93c",
      "brass-light": "#ecbf5f",
      "brass-numeral": "#a67716",
      "brass-text": "#7c5a10",
    },
  },
  {
    id: "aubergine",
    name: "Aubergine & citron",
    colors: {
      cream: "#f5f1ec",
      "cream-deep": "#ebe3e0",
      ink: "#38213f",
      "ink-muted": "#66506c",
      wash: "#ab8db5",
      "wash-light": "#e3d6e6",
      brass: "#cdb846",
      "brass-light": "#ddcc63",
      "brass-numeral": "#857619",
      "brass-text": "#6b5f13",
    },
  },
];

export type Selection = { display: string; body: string; palette: string };

// Keep in sync with app/layout.tsx and the @theme colors in globals.css.
export const DEFAULTS: Selection = {
  display: "cormorant",
  body: "atkinson",
  palette: "pine",
};

const pick = <T extends { id: string }>(list: T[], id: unknown, fallback: string) =>
  list.find((o) => o.id === id)?.id ?? fallback;

export function parseSelection(params: Record<string, string | string[] | undefined>): Selection {
  return {
    display: pick(DISPLAY_FONTS, params.display, DEFAULTS.display),
    body: pick(BODY_FONTS, params.body, DEFAULTS.body),
    palette: pick(PALETTES, params.palette, DEFAULTS.palette),
  };
}
