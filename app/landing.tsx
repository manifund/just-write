import Link from "next/link";
import { Suspense } from "react";
import { Calendar } from "./calendar";
import { InterestForm } from "./interest-form";
import { Interested } from "./interested";

const RULES = [
  {
    numeral: "1.",
    title: "Write 100 words each day",
    detail: "Post your snippet online; one “grace day” each week.",
  },
  {
    numeral: "2.",
    title: "Publish 1000 words each week",
    detail: "Work on timeless, ambitious essays.",
  },
  {
    numeral: "3.",
    title: "Deposit $1,000 for accountability",
    detail: "Refunded if you publish all 4 essays on time.",
  },
  {
    numeral: "4.",
    title: "Write alongside friends",
    detail: "Get feedback & chat online; optional IRL meetups in SF",
  },
];

function NavLinks() {
  return (
    <>
      <Link href="/members">Members</Link>
      <Link href="/home">Sign in</Link>
    </>
  );
}

export function Landing() {
  return (
    <main className="@container grid min-h-dvh grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))]">
      <section className="relative flex flex-col gap-[clamp(24px,4vh,40px)] overflow-hidden bg-ink px-[clamp(24px,4vw,56px)] py-[clamp(28px,4.5vh,56px)] text-cream">
        <div className="relative flex items-baseline justify-between gap-4">
          <div className="font-display text-[25px] font-medium tracking-[-0.01em]">
            Just <span className="text-brass-light">Write</span>
          </div>
          {/* Two columns at 1120px (2 × 560px): the nav moves to the right column. */}
          <nav className="flex gap-5 text-[15px] text-wash-light @min-[1120px]:hidden">
            <NavLinks />
          </nav>
        </div>
        <div className="relative flex flex-col gap-[clamp(14px,2.4vh,22px)]">
          <h1 className="max-w-[8.5em] font-display text-[clamp(min(44px,calc((100vw_-_48px)/9)),min(5.4vw,7.6vh),80px)] leading-none font-[340] tracking-[-0.025em] text-balance">
            <span className="whitespace-nowrap">Write 4 great essays</span>{" "}
            <br /> over 4 weeks.
          </h1>
          <p className="max-w-[28em] text-[clamp(18px,2.6vh,20px)] leading-[1.45] text-pretty text-wash-light">
            An online writing club with a commitment to publish.
          </p>
          <div aria-hidden="true" className="h-11 md:hidden" />
        </div>
        <Calendar />
      </section>

      <section className="flex flex-col gap-[clamp(16px,2.8vh,36px)] px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)]">
        <nav className="hidden justify-end gap-5 text-[15px] text-ink-muted @min-[1120px]:flex">
          <NavLinks />
        </nav>
        <ol
          aria-label="How it works"
          className="flex flex-col gap-[clamp(8px,1.8vh,20px)]"
        >
          {RULES.map((r, i) => (
            <li
              key={r.numeral}
              className="grid grid-cols-[34px_minmax(0,1fr)] items-baseline gap-3 md:grid-cols-[52px_minmax(0,1fr)]"
            >
              <span
                aria-hidden="true"
                className="wonk font-display text-[clamp(26px,4.4vh,32px)] font-semibold text-brass-numeral"
              >
                {r.numeral}
              </span>
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-[clamp(19px,3.1vh,22px)] font-[450] text-pretty">
                  {r.title}
                </h3>
                <p className="text-[clamp(15px,2.4vh,17px)] leading-[1.4] text-pretty text-ink-muted">
                  {r.detail}
                </p>
                {i === RULES.length - 1 && (
                  <div className="mt-[clamp(6px,1.2vh,12px)]">
                    <Suspense fallback={null}>
                      <Interested />
                    </Suspense>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="max-md:-mx-[clamp(24px,5vw,72px)] md:mt-auto">
          <InterestForm />
        </div>

        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-2 text-[15px] text-ink-muted">
          <span>
            Inspired by <a href="https://www.inkhaven.blog/">Inkhaven</a> and{" "}
            <a href="https://en.wikipedia.org/wiki/National_Novel_Writing_Month">
              NaNoWriMo
            </a>
            .
          </span>
          <span>
            By Austin, of <a href="https://manifund.org">Manifund</a>.
          </span>
        </footer>
      </section>
    </main>
  );
}
