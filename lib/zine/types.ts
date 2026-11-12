// The magazine's cached issue (content/zine/week-<n>.json, written by scripts/zine-cache.ts).
export type ZineEssay = {
  id: string; // essays row id
  title: string;
  url: string;
  submittedAt: number;
  author: { name: string; handle: string | null; bio: string | null };
  // The article, cleaned to p, h2–h4, blockquote, lists, em/strong, links, img, figure, hr,
  // pre/code, tables. Images point at /zine/week-<n>/….
  html: string;
  words: number;
  excerpt?: string | null;
  fetchedAt: number;
  error: string | null; // why the page couldn't be read; html is empty then
};

export type ZineIssue = { week: number; cachedAt: number; essays: ZineEssay[] };

// content/zine/art.json: illustrations by essay id, plus an optional "cover".
// file is a path under public/, e.g. "/zine/art/<essayId>.png".
export type ZineArtEntry = {
  file: string; // print resolution
  web?: string; // smaller copy for the on-screen preview
  prompt?: string;
  alt?: string;
  credit?: string;
};
export type ZineArt = Record<string, ZineArtEntry | undefined>;

// content/zine/defaults.json (scripts/zine-pages.ts): each week's pages typeset once in the
// default design. key is the hash of the document they came from; src is under public/.
export type ZineDefaults = Record<string, { key: string; pages: number; src: string } | undefined>;
