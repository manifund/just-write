import { fetchQuery } from "convex/nextjs";
import { cacheLife, cacheTag } from "next/cache";
import { api } from "@/convex/_generated/api";

type Person = {
  _id: string;
  name: string;
  link: string | null;
  committed: boolean;
};

async function getPeople(): Promise<Person[]> {
  "use cache";
  cacheTag("interest");
  cacheLife("minutes");
  try {
    return await fetchQuery(api.members.interestedList, {});
  } catch (err) {
    // A missing Convex URL (e.g. a local build) shouldn't break the page.
    console.error("getPeople failed", err);
    return [];
  }
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

function Row({ label, people }: { label: string; people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <p className="text-[clamp(15px,2.4vh,17px)] leading-[1.5] text-pretty text-ink-muted">
      <span className="mr-2 text-[13px] tracking-[0.12em] uppercase">
        {label}:
      </span>
      {people.map((p, i) => (
        <span key={p._id}>
          {p.link ? (
            <a
              href={p.link}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="text-ink"
            >
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

// Committed people get their own row and drop out of "Interested".
export async function Interested() {
  const people = await getPeople();
  return (
    <div className="flex flex-col gap-1">
      <Row label="Committed" people={people.filter((p) => p.committed)} />
      <Row label="Interested" people={people.filter((p) => !p.committed)} />
    </div>
  );
}
