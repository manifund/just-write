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
