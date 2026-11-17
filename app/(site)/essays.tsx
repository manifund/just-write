import { fetchQuery } from "convex/nextjs";
import { cacheLife, cacheTag } from "next/cache";
import { api } from "@/convex/_generated/api";

type Essay = { _id: string; title: string; url: string; author: string };

async function getEssays(): Promise<Essay[]> {
  "use cache";
  cacheTag("essays");
  cacheLife("minutes");
  try {
    const rows = await fetchQuery(api.essays.recent, { limit: 30 });
    return rows.map((e) => ({
      _id: e._id,
      title: e.title,
      url: e.url,
      author: e.author.name,
    }));
  } catch (err) {
    console.error("getEssays failed", err);
    return [];
  }
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

function Item({ essay, hidden }: { essay: Essay; hidden?: boolean }) {
  return (
    <li className="shrink-0 pr-2" aria-hidden={hidden || undefined}>
      <a
        href={essay.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        tabIndex={hidden ? -1 : undefined}
        className="flex max-w-[22em] flex-col rounded-md bg-cream-deep px-3 py-2 no-underline transition-colors hover:bg-cream-hover"
      >
        <span className="truncate font-display text-[15px] text-ink">
          {essay.title}
        </span>
        <span className="text-[12px] text-ink-muted">
          {firstName(essay.author)}
        </span>
      </a>
    </li>
  );
}

// Recent essays scrolling sideways; hover or focus pauses it. The list is
// rendered twice so the loop has no gap; the copy is hidden from screen readers.
export async function Essays() {
  const essays = await getEssays();
  if (essays.length === 0) return null;
  const duration = Math.max(20, essays.length * 5);
  return (
    <div className="marquee-wrap flex flex-col gap-1.5">
      <span className="text-[11px] tracking-[0.12em] text-ink-muted uppercase">
        Recent essays
      </span>
      <div className="overflow-hidden mask-x-from-90% mask-x-to-100%">
        <ul
          className="marquee flex w-max"
          style={
            {
              "--marquee-duration": `${duration}s`,
            } as React.CSSProperties
          }
        >
          {essays.map((e) => (
            <Item key={e._id} essay={e} />
          ))}
          {essays.map((e) => (
            <Item key={`${e._id}-copy`} essay={e} hidden />
          ))}
        </ul>
        {/* The page is cached, so pick a random starting point in the
            browser, before first paint, with a negative animation delay. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.currentScript.previousElementSibling.style.animationDelay="-"+(Math.random()*${duration}).toFixed(1)+"s"`,
          }}
        />
      </div>
    </div>
  );
}
