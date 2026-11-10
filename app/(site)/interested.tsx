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

const TEXT =
  "text-[clamp(13px,2vh,15px)] leading-[1.55] text-pretty text-ink-muted";
const LABEL = "text-[11px] tracking-[0.12em] uppercase";

function Names({ people }: { people: Person[] }) {
  return people.map((p, i) => (
    <span key={p._id}>
      {p.link ? (
        <a
          href={p.link}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="decoration-wash"
        >
          {firstName(p.name)}
        </a>
      ) : (
        firstName(p.name)
      )}
      {i < people.length - 1 && ", "}
    </span>
  ));
}

function Row({ label, people }: { label: string; people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <p className={TEXT}>
      <span className={`mr-2 ${LABEL}`}>{label}:</span>
      <Names people={people} />
    </p>
  );
}

// Collapsed by default so the list doesn't crowd the page.
function Expander({ label, people }: { label: string; people: Person[] }) {
  if (people.length === 0) return null;
  return (
    <details className={`group ${TEXT}`}>
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 transition-colors select-none hover:text-ink [&::-webkit-details-marker]:hidden ${LABEL}`}
      >
        {label} ({people.length})
        <svg
          viewBox="0 0 10 10"
          aria-hidden
          className="size-2 transition-transform group-open:rotate-90"
        >
          <path
            d="M3 1.5 6.5 5 3 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </summary>
      <p className="mt-1">
        <Names people={people} />
      </p>
    </details>
  );
}

// Committed people get their own row and drop out of "Interested".
export async function Interested() {
  const people = await getPeople();
  return (
    <div className="flex flex-col gap-1">
      <Row label="Committed" people={people.filter((p) => p.committed)} />
      <Expander
        label="Interested"
        people={people.filter((p) => !p.committed)}
      />
    </div>
  );
}
