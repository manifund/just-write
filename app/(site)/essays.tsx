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

function Item({
  essay,
  hidden,
  dark,
}: {
  essay: Essay;
  hidden?: boolean;
  dark?: boolean;
}) {
  return (
    <li className="shrink-0 pr-2" aria-hidden={hidden || undefined}>
      <a
        href={essay.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        tabIndex={hidden ? -1 : undefined}
        className={`flex max-w-[22em] flex-col rounded-md px-3 py-2 no-underline transition-colors ${dark ? "bg-cream/[0.07] ring-1 ring-cream/10 ring-inset hover:bg-cream/[0.13]" : "bg-cream-deep hover:bg-cream-hover"}`}
      >
        <span
          className={`truncate font-display text-[15px] ${dark ? "text-cream" : "text-ink"}`}
        >
          {essay.title}
        </span>
        <span
          className={`text-[12px] ${dark ? "text-wash-light/70" : "text-ink-muted"}`}
        >
          {firstName(essay.author)}
        </span>
      </a>
    </li>
  );
}

// Recent essays scrolling sideways; hover or focus pauses it. The list is
// rendered twice so the loop has no gap; the copy is hidden from screen readers.
// `dark` is for the landing page's ink-colored left column.
export async function Essays({ dark }: { dark?: boolean } = {}) {
  const essays = await getEssays();
  if (essays.length === 0) return null;
  // About 10s per essay, so titles can be read as they pass.
  const duration = Math.max(40, essays.length * 10);
  return (
    <div className="marquee-wrap flex flex-col gap-1.5">
      <span
        className={`text-[11px] tracking-[0.12em] uppercase ${dark ? "text-wash-light/80" : "text-ink-muted"}`}
      >
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
            <Item key={e._id} essay={e} dark={dark} />
          ))}
          {essays.map((e) => (
            <Item key={`${e._id}-copy`} essay={e} hidden dark={dark} />
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
