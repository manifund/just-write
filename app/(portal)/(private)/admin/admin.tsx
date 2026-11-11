"use client";

import { useMutation, useQuery } from "convex/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { usePortal } from "@/components/portal/context";
import { hostOf } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";

const fmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});

// `Name <email>`, quoting names with commas or other special characters.
function address(r: { name?: string; email: string }) {
  const name = r.name?.trim();
  if (!name) return r.email;
  const safe = /^[\p{L}\p{N} .'-]+$/u.test(name)
    ? name
    : `"${name.replace(/["\\]/g, "\\$&")}"`;
  return `${safe} <${r.email}>`;
}

type Row = { name?: string; email: string; status: string };

const GROUPS = [
  {
    key: "all",
    label: "All",
    title: "Everyone on the list",
    match: () => true,
  },
  {
    key: "committed",
    label: "Committed",
    title: "Paid the deposit",
    match: (r: Row) => r.status === "committed",
  },
  {
    key: "interested",
    label: "Interested",
    title: "Not yet committed (includes signed, unpaid)",
    match: (r: Row) => r.status !== "committed" && r.status !== "reader",
  },
  {
    key: "reader",
    label: "Readers",
    title: "Just Readers (Manifund sign-ins who aren’t writing)",
    match: (r: Row) => r.status === "reader",
  },
] as const;

// Copy buttons for each audience. The list itself stays hidden unless asked for.
function CopyEmails({ rows }: { rows: Row[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const lists = GROUPS.map((g) => {
    const picked = rows.filter(g.match);
    return { ...g, count: picked.length, text: picked.map(address).join(", ") };
  });
  const preview = lists.find((l) => l.key === shown);

  return (
    <section className="flex flex-col gap-3 border border-ink/15 p-4 text-[15px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[13px] tracking-[0.12em] text-ink-muted uppercase">
          Copy emails
        </span>
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => (
            <button
              key={l.key}
              type="button"
              title={l.title}
              disabled={l.count === 0}
              onClick={async () => {
                await navigator.clipboard.writeText(l.text);
                setCopied(l.key);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(null), 1500);
              }}
              className={`min-w-[9.5rem] cursor-pointer border px-3 py-1 tabular-nums transition-colors disabled:cursor-default disabled:opacity-40 ${
                copied === l.key
                  ? "border-ink bg-ink text-cream"
                  : "border-ink/25 hover:border-ink"
              }`}
            >
              {copied === l.key
                ? `Copied ${l.count}`
                : `${l.label} (${l.count})`}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-ink-muted">
          Preview
          <select
            value={shown ?? ""}
            onChange={(e) => setShown(e.target.value || null)}
            className="border border-ink/25 bg-cream px-2 py-1 text-ink"
          >
            <option value="">Hidden</option>
            {lists.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {preview && (
        <p className="max-h-48 overflow-y-auto break-words text-ink-muted select-all">
          {preview.text || "No one yet."}
        </p>
      )}
    </section>
  );
}

export function Admin() {
  const { viewer } = usePortal();
  if (!viewer.isAdmin)
    return <p className="p-10 text-[18px] text-ink-muted">Admins only.</p>;
  return <Overview />;
}

function Overview() {
  const rows = useQuery(api.admin.overview);
  const review = useMutation(api.admin.setEssayReview);
  const [filter, setFilter] = useState<
    "all" | "committed" | "signed" | "interested" | "reader"
  >("all");
  if (!rows) return <p className="p-10 text-ink-muted">Loading…</p>;

  const shown =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <main className="flex flex-col gap-6 px-[clamp(20px,4vw,56px)] py-10">
      <h1 className="font-display text-[36px] font-[340]">Admin</h1>
      <CopyEmails rows={rows} />
      <div className="flex flex-wrap items-center gap-2 text-[15px]">
        {(["all", "committed", "signed", "interested", "reader"] as const).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`cursor-pointer border px-3 py-1 capitalize ${filter === f ? "border-ink bg-ink text-cream" : "border-ink/25"}`}
            >
              {f} ({f === "all" ? rows.length : count(f)})
            </button>
          ),
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[16px]">
          <thead className="text-[13px] tracking-[0.12em] text-ink-muted uppercase">
            <tr className="border-b border-ink/28">
              <th className="py-2 pr-5 font-normal">Name</th>
              <th className="py-2 pr-5 font-normal">Email</th>
              <th className="py-2 pr-5 font-normal">Website</th>
              <th className="py-2 pr-5 font-normal">Joined (PT)</th>
              <th className="py-2 pr-5 font-normal">Status</th>
              <th className="py-2 font-normal">Essays</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r._id}>
                <tr className="border-b border-ink/10 align-top">
                  <td className="py-2 pr-5">{r.name}</td>
                  <td className="py-2 pr-5">
                    <a href={`mailto:${r.email}`}>{r.email}</a>
                  </td>
                  <td className="py-2 pr-5">
                    {r.link ? (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        {hostOf(r.link)}
                      </a>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-5 whitespace-nowrap text-ink-muted tabular-nums">
                    {fmt.format(r.createdAt)}
                  </td>
                  <td className="py-2 pr-5 whitespace-nowrap">
                    {r.status === "committed" ? (
                      <span
                        title={
                          r.committedAt
                            ? `Paid ${fmt.format(r.committedAt)}`
                            : undefined
                        }
                      >
                        Committed
                        {r.stripePaymentIntent && (
                          <>
                            {" · "}
                            <a
                              href={`https://dashboard.stripe.com/payments/${r.stripePaymentIntent}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-ink-muted"
                            >
                              Stripe
                            </a>
                          </>
                        )}
                      </span>
                    ) : r.status === "signed" ? (
                      <span
                        className="text-ink-muted"
                        title={`Signed “${r.signedName}”`}
                      >
                        Signed, unpaid
                      </span>
                    ) : r.status === "reader" ? (
                      <span className="text-ink-muted">Just Reader</span>
                    ) : (
                      <span className="text-ink-muted">Interested</span>
                    )}
                  </td>
                  <td className="py-2 tabular-nums">
                    {r.status === "committed" ? `${r.slotsFilled}/4` : ""}
                  </td>
                </tr>
                {r.essays.map((e) => (
                  <tr key={e._id} className="border-b border-ink/5 text-[15px]">
                    <td />
                    <td colSpan={3} className="py-1.5 pr-5">
                      ↳{" "}
                      <a href={e.url} target="_blank" rel="noopener noreferrer">
                        {e.title}
                      </a>{" "}
                      <span className="text-ink-muted">
                        · {fmt.format(e.submittedAt)}
                        {e.wordCount
                          ? ` · ~${e.wordCount.toLocaleString()} words`
                          : ""}
                      </span>
                    </td>
                    <td colSpan={2} className="py-1.5">
                      <select
                        aria-label={`Review for ${e.title}`}
                        value={e.review}
                        onChange={(ev) =>
                          review({
                            essayId: e._id,
                            review: ev.target.value as
                              "pending" | "verified" | "rejected",
                          })
                        }
                        className="border border-ink/25 bg-cream px-2 py-1"
                      >
                        <option value="pending">Pending</option>
                        <option value="verified">Verified ✓</option>
                        <option value="rejected">Rejected (not counted)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
