import { cacheLife } from "next/cache";
import { previewableUrl } from "@/convex/lib/linkMeta";

// Likes on a Substack post, from Substack's public post API (`/api/v1/posts/<slug>`,
// which custom-domain Substacks serve too). Null for anything that isn't a Substack post
// or doesn't answer. Cached per URL for a few hours.
export async function substackLikes(href: string): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  const safe = previewableUrl(href);
  if (!safe) return null;
  const url = new URL(safe);
  const slug = url.pathname.match(/^\/p\/([\w-]+)\/?$/)?.[1];
  if (!slug) return null;
  try {
    const res = await fetch(`${url.origin}/api/v1/posts/${slug}`, {
      signal: AbortSignal.timeout(4000),
      redirect: "error",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const count = (data as { reaction_count?: unknown } | null)?.reaction_count;
    return typeof count === "number" && count >= 0 ? count : null;
  } catch {
    return null;
  }
}
