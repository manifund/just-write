import type { Metadata } from "next";
import Link from "next/link";
import { CommitForm } from "./commit-form";

export const metadata: Metadata = {
  title: "Commit · Just Write",
  description: "Read the terms and put down your $1,000 commitment deposit for Just Write, Nov 2026.",
  alternates: { canonical: "/commit" },
  robots: { index: false, follow: false },
};

type Term = { title: string; intro?: React.ReactNode; bullets?: React.ReactNode[]; outro?: React.ReactNode[] };

const TERMS: Term[] = [
  {
    title: "Publish 4 essays",
    intro: "To join Just Write, you commit to publish 4 essays in the month of November 2026:",
    bullets: [
      "Essays are due on or before Mondays, 9pm PT: Nov 9, 16, 23, and 30.",
      "Essays must be 1000 words or more.",
      "Essays must be posted on the public internet (eg personal website, company blog, Substack, X, or anywhere with a public URL).",
      "Essay URLs must be registered through the Just Write portal.",
      "Essays may be featured on the Just Write public website.",
    ],
  },
  {
    title: "Deposit $1,000",
    intro: (
      <>
        To enforce this publishing commitment, you will deposit $1000 with{" "}
        <a href="https://manifund.org">Manifund</a> (legally Manifold for Charity, a 501c3 nonprofit, EIN
        88-3668801), as a credit card payment via Stripe.
      </>
    ),
    bullets: [
      "If you succeed at publishing 4 essays before their respective deadlines, Manifund will refund this credit card payment, on or around Dec 2, 2026. (Manifund will pay any associated refund fees.)",
      "If you miss any essay deadline, the $1000 becomes an unrestricted donation to Manifund. We’ll send you a receipt; check with your tax advisor on tax-deductibility. (You may continue in the program after this point, if you so wish.)",
    ],
    outro: [
      "Austin (and his Claude) will adjudicate any edge cases.",
    ],
  },
  {
    title: "The spirit of the club",
    outro: [
      "We encourage you to write evergreen, ambitious essays, which you will look back on with pride. But we can’t and won’t enforce that. If you fulfill your commitment via LLM slop, or the word “essay” repeated 1000 times, that will be between you and your conscience. (Public shaming may also commence.)",
    ],
  },
  {
    title: "What we’ll offer",
    intro: "Just Write also plans to offer, on a best-effort basis:",
    bullets: [
      "An online platform to chat with other participants (eg Discord, or a new internal forum)",
      "Daily check-ins, where you share 100 words of your recent writing",
      "Weekly writing circles, online & in SF on Saturday",
      "A wrap party in SF, on the evening of Wed Dec 2",
    ],
  },
];

const para = "text-[17px] leading-[1.55] text-pretty text-ink-muted";

export default function CommitPage() {
  return (
    <main className="min-h-dvh">
      <header className="bg-ink px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)] text-cream">
        <div className="mx-auto flex max-w-[44rem] flex-col gap-[clamp(20px,4vh,40px)]">
          <Link href="/" className="font-display text-[25px] font-medium tracking-[-0.01em] no-underline">
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
          <ol aria-label="Terms" className="flex flex-col gap-[clamp(24px,4vh,36px)]">
            {TERMS.map((t, i) => (
              <li key={t.title} className="grid grid-cols-[34px_minmax(0,1fr)] items-baseline gap-3 md:grid-cols-[52px_minmax(0,1fr)]">
                <span aria-hidden="true" className="wonk font-display text-[clamp(26px,4.4vh,32px)] font-semibold text-brass-numeral">
                  {i + 1}.
                </span>
                <div className="flex flex-col gap-2">
                  <h2 className="font-display text-[clamp(21px,3.1vh,24px)] font-[450] text-pretty">{t.title}</h2>
                  {t.intro && <p className={para}>{t.intro}</p>}
                  {t.bullets && (
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-brass-numeral">
                      {t.bullets.map((b, j) => (
                        <li key={j} className={`${para} pl-1`}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.outro?.map((p, j) => (
                    <p key={j} className={para}>
                      {p}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[19px] leading-[1.5] text-pretty md:pl-[64px]">
            If you have any questions, please contact Austin at{" "}
            <a href="mailto:austin@manifund.org">austin@manifund.org</a>. We’re excited to read what you write!
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
