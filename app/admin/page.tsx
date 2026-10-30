import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { sql, type Submission } from "@/lib/db";

// Not access-controlled yet: anyone with the URL can see submissions.
export const metadata: Metadata = {
  title: "Submissions · Just Write",
  robots: { index: false, follow: false },
};

const fmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});

async function Submissions() {
  await connection(); // always read fresh rows at request time
  const rows = (await sql()`
    SELECT id, name, email, link, status, signed_name, signed_at, committed_at, stripe_payment_intent, created_at
    FROM interest ORDER BY created_at DESC
  `) as Submission[];

  const committed = rows.filter((r) => r.status === "committed").length;

  if (rows.length === 0) {
    return <p className="text-ink-muted">No submissions yet.</p>;
  }

  return (
    <>
      <p className="text-ink-muted">
        {rows.length} {rows.length === 1 ? "person" : "people"} ({committed} committed) ·{" "}
        <span className="select-all">{rows.map((r) => r.email).join(", ")}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[17px]">
          <thead className="text-[13px] tracking-[0.12em] text-ink-muted uppercase">
            <tr className="border-b border-ink/28">
              <th className="py-2 pr-6 font-normal">Name</th>
              <th className="py-2 pr-6 font-normal">Email</th>
              <th className="py-2 pr-6 font-normal">Website</th>
              <th className="py-2 pr-6 font-normal">Submitted (PT)</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/10">
                <td className="py-2 pr-6">{r.name}</td>
                <td className="py-2 pr-6">
                  <a href={`mailto:${r.email}`}>{r.email}</a>
                </td>
                <td className="py-2 pr-6">
                  {r.link ? (
                    <a href={r.link} target="_blank" rel="noopener noreferrer nofollow">
                      {r.link.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="py-2 pr-6 whitespace-nowrap text-ink-muted tabular-nums">
                  {fmt.format(new Date(r.created_at))}
                </td>
                <td className="py-2 whitespace-nowrap">
                  {r.status === "committed" ? (
                    <span title={r.committed_at ? `Paid ${fmt.format(new Date(r.committed_at))}` : undefined}>
                      Committed
                      {r.stripe_payment_intent && (
                        <>
                          {" · "}
                          <a
                            href={`https://dashboard.stripe.com/payments/${r.stripe_payment_intent}`}
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
                      title={`Signed “${r.signed_name}”${r.signed_at ? ` ${fmt.format(new Date(r.signed_at))}` : ""}, not paid`}
                    >
                      Signed, unpaid
                    </span>
                  ) : (
                    <span className="text-ink-muted">Interested</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
      <h1 className="font-display text-[36px] font-[340]">
        Express <em className="wonk">interest</em> submissions
      </h1>
      <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
        <Submissions />
      </Suspense>
    </main>
  );
}
