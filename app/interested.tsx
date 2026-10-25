import { cacheLife, cacheTag } from "next/cache";
import { sql } from "@/lib/db";

type Person = { id: number; name: string; link: string | null };

async function getInterested(): Promise<Person[]> {
  "use cache";
  cacheTag("interest");
  cacheLife("minutes");
  try {
    return (await sql()`
      SELECT id, name, link FROM interest ORDER BY created_at
    `) as Person[];
  } catch (err) {
    // Missing DATABASE_URL (e.g. a local build) shouldn't break the page.
    console.error("getInterested failed", err);
    return [];
  }
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

export async function Interested() {
  const people = await getInterested();
  if (people.length === 0) return null;

  return (
    <p className="text-[clamp(15px,2.4vh,17px)] leading-[1.5] text-pretty text-ink-muted">
      <span className="mr-2 text-[13px] tracking-[0.12em] uppercase">Interested:</span>
      {people.map((p, i) => (
        <span key={p.id}>
          {p.link ? (
            <a href={p.link} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-ink">
              {firstName(p.name)}
            </a>
          ) : (
            firstName(p.name)
          )}
          {i < people.length - 1 && ", "}
        </span>
      ))}
    </p>
  );
}
