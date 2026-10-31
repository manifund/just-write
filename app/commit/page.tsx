import type { Metadata } from "next";
import Link from "next/link";
import { runs, TERMS, type Rich } from "@/lib/terms";
import { CommitForm } from "./commit-form";

export const metadata: Metadata = {
  title: "Commit · Just Write",
  description:
    "Read the terms and put down your $1,000 commitment deposit for Just Write, Nov 2026.",
  alternates: { canonical: "/commit" },
  robots: { index: false, follow: false },
};

const para = "text-[17px] leading-[1.55] text-pretty text-ink-muted";

function RichText({ value }: { value: Rich }) {
  return runs(value).map((r, i) =>
    typeof r === "string" ? (
      r
    ) : (
      <a key={i} href={r.href}>
        {r.text}
      </a>
    ),
  );
}

export default function CommitPage() {
  return (
    <main className="min-h-dvh">
      <header className="bg-ink px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)] text-cream">
        <div className="mx-auto flex max-w-[44rem] flex-col gap-[clamp(20px,4vh,40px)]">
          <Link
            href="/"
            className="font-display text-[25px] font-medium tracking-[-0.01em] no-underline"
          >
            Just <span className="text-brass-light">Write</span>
          </Link>
          <div className="flex flex-col gap-3">
            <h1 className="font-display text-[clamp(40px,6vw,64px)] leading-none font-[340] tracking-[-0.025em] text-balance">
              Commit to publish.
            </h1>
          </div>
        </div>
      </header>

      <div className="px-[clamp(24px,5vw,72px)] py-[clamp(32px,6vh,64px)]">
        <div className="mx-auto flex max-w-[44rem] flex-col gap-[clamp(32px,6vh,56px)]">
          <ol
            aria-label="Terms"
            className="flex flex-col gap-[clamp(24px,4vh,36px)]"
          >
            {TERMS.map((t, i) => (
              <li
                key={t.title}
                className="grid grid-cols-[34px_minmax(0,1fr)] items-baseline gap-3 md:grid-cols-[52px_minmax(0,1fr)]"
              >
                <span
                  aria-hidden="true"
                  className="wonk font-display text-[clamp(26px,4.4vh,32px)] font-semibold text-brass-numeral"
                >
                  {i + 1}.
                </span>
                <div className="flex flex-col gap-2">
                  <h2 className="font-display text-[clamp(21px,3.1vh,24px)] font-[450] text-pretty">
                    {t.title}
                  </h2>
                  {t.intro && (
                    <p className={para}>
                      <RichText value={t.intro} />
                    </p>
                  )}
                  {t.bullets && (
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-brass-numeral">
                      {t.bullets.map((b, j) => (
                        <li key={j} className={`${para} pl-1`}>
                          <RichText value={b} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.outro?.map((p, j) => (
                    <p key={j} className={para}>
                      <RichText value={p} />
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[19px] leading-[1.5] text-pretty md:pl-[64px]">
            If you have any questions, please contact Austin at{" "}
            <a href="mailto:austin@manifund.org">austin@manifund.org</a>. We’re
            excited to read what you write!
          </p>

          <div className="max-md:-mx-[clamp(24px,5vw,72px)]">
            <CommitForm />
          </div>

          <footer className="flex flex-wrap justify-between gap-x-6 gap-y-2 text-[15px] text-ink-muted">
            <Link href="/">Back to Just Write</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
