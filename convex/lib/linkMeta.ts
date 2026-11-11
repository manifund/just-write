// Reading a page's preview card (Open Graph / Twitter tags, like the cards social sites
// show for links) and finding the links in a message. Dependency-free, any runtime.
import { decode } from "./essayText";
import type { RichNode } from "./richtext";

export type LinkMeta = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

const SITE_HOSTS = new Set(["justwrite.club", "www.justwrite.club"]);
export const MAX_LINK_PREVIEWS = 3;

// A URL worth a preview card: http(s), not this site (those get their own previews), and
// not a local or private address.
export function previewableUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (SITE_HOSTS.has(host) || !host.includes(".")) return null;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.startsWith("[") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  )
    return null;
  url.hash = "";
  return url.toString().slice(0, 2_000);
}

// The external links in a Tiptap document, in order, deduplicated, at most MAX_LINK_PREVIEWS.
export function messageUrls(body: string): string[] {
  let doc: RichNode;
  try {
    doc = JSON.parse(body);
  } catch {
    return [];
  }
  const found: string[] = [];
  const walk = (n: RichNode) => {
    for (const m of n.marks ?? []) {
      if (m.type !== "link") continue;
      const url = previewableUrl(String(m.attrs?.href ?? ""));
      if (url && !found.includes(url)) found.push(url);
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc);
  return found.slice(0, MAX_LINK_PREVIEWS);
}

const clip = (s: string | undefined, n: number) => {
  const t = s?.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
};

// Reads <meta> tags and <title> out of a page's <head>.
export function parseMeta(html: string, pageUrl: string): LinkMeta {
  const head = html.slice(0, 500_000).split(/<\/head>/i)[0];
  const tags = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const a of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
    ))
      attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content && !tags.has(key)) tags.set(key, decode(content));
  }
  const pick = (...keys: string[]) =>
    keys.map((k) => tags.get(k)).find((v) => v?.trim());
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let image = pick(
    "og:image:secure_url",
    "og:image",
    "twitter:image",
    "twitter:image:src",
  );
  if (image) {
    try {
      image = new URL(image.trim(), pageUrl).toString();
    } catch {
      image = undefined;
    }
  }
  return {
    title: clip(
      pick("og:title", "twitter:title") ?? (titleTag && decode(titleTag)),
      200,
    ),
    description: clip(
      pick("og:description", "twitter:description", "description"),
      300,
    ),
    // Only https images, so cards never load anything insecure.
    image:
      image && /^https:\/\//i.test(image) ? image.slice(0, 2_000) : undefined,
    siteName: clip(pick("og:site_name", "application-name"), 80),
  };
}
