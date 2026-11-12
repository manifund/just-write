// The house style for article illustrations (docs/illustrations.md). Every image prompt
// is the essay's subject plus STYLE, so the batch reads as one hand.
import { existsSync, readFileSync } from "node:fs";

export const STYLE =
  "Render it as a linocut print: black ink on off-white paper, bold carved lines, " +
  "high contrast, no gray wash or gradients, one central subject on plain paper. " +
  "Vignette: the carving thins out and fades into the bare paper at the edges, with no hard " +
  "rectangular block or outline around the scene. " +
  "Strictly black and white. No text, letters, signature, frame, or border.";

export const ASPECT = "3:2";

// Once Austin approves an image, its path goes in content/zine/art-style.json as
// {"ref": "public/zine/art/<id>.png"}; generate.ts sends it along as a style reference
// so later images match.
export const STYLE_FILE = "content/zine/art-style.json";

export function styleRef(): string | null {
  if (!existsSync(STYLE_FILE)) return null;
  const { ref } = JSON.parse(readFileSync(STYLE_FILE, "utf8"));
  return typeof ref === "string" && ref && existsSync(ref) ? ref : null;
}

export function imagePrompt(subject: string, withRef: boolean) {
  const ref = withRef
    ? " Match the style, line weight, and paper texture of the attached reference print exactly, but not its subject."
    : "";
  return `Illustration for a literary magazine essay: ${subject.replace(/[.\s]+$/, "")}. ${STYLE}${ref}`;
}

// The manifest /zine and the site read (content/zine/art.json). Keys are essay ids,
// plus an optional "cover".
export type ArtEntry = {
  file: string; // path under public/, e.g. "/zine/art/<id>.png"
  web?: string; // smaller copy for the site, e.g. "/zine/art/<id>.webp"
  prompt: string | null; // null for art an author supplied
  alt: string;
  credit: string; // the model, or the artist's name
};
export type ArtManifest = Record<string, ArtEntry>;

// Subjects awaiting generation (content/zine/art-prompts.json, from scripts/art/prompts.ts).
export type ArtPrompt = {
  id: string;
  title: string;
  author: string;
  subject: string; // edit this by hand before generating
  alt: string;
};
