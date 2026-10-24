import { Calendar } from "./calendar";
import { InterestForm } from "./interest-form";

const RULES = [
  {
    numeral: "i.",
    title: "Write 100 words each day",
    detail: "Post your snippet on X, LW, personal blog. One “grace day” each week.",
  },
  {
    numeral: "ii.",
    title: "Publish a 1000 word essay each week",
    detail:
      "Aiming for a timeless, high quality essay.",
  },
  {
    numeral: "iii.",
    title: "$1,000 deposit required",
    detail: "Refunded if you succeed.",
  },
  {
    numeral: "iv.",
    title: "Online, with meetups in SF",
    detail:
      "A Discord server for people to chat & get feedback; and weekly Saturday afternoon meetups at Mox dedicated to writing.",
  },
];

function InkWash() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 500"
      className="pointer-events-none absolute -top-[190px] -right-[220px] h-[500px] w-[600px]"
    >
      <defs>
        <filter id="jw-wash" x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="110" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g filter="url(#jw-wash)" className="fill-wash">
        <ellipse cx="300" cy="250" rx="220" ry="170" opacity="0.16" />
        <ellipse cx="360" cy="200" rx="140" ry="100" opacity="0.18" />
      </g>
    </svg>
  );
}

export function Landing() {
  return (
    <main className="grid min-h-dvh grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))]">
      <section className="relative flex flex-col gap-[clamp(24px,4vh,40px)] overflow-hidden bg-ink px-[clamp(24px,4vw,56px)] py-[clamp(28px,4.5vh,56px)] text-cream">
        <InkWash />
        <div className="relative font-display text-[25px] font-medium tracking-[-0.01em]">
          Just Write
        </div>
        <div className="relative flex flex-col gap-[clamp(14px,2.4vh,22px)]">
          <p className="text-sm tracking-[0.14em] text-brass-light uppercase">
            4-week online writing club
          </p>
          <h1 className="max-w-[8.5em] font-display text-[clamp(44px,min(5.4vw,7.6vh),80px)] leading-none font-[340] tracking-[-0.025em] text-balance">
            Everyone has a <span className="text-brass-light">great essay</span> in them.
          </h1>
          <p className="max-w-[28em] text-[clamp(18px,2.6vh,20px)] leading-[1.45] text-pretty text-wash-light">
            We especially want to hear from people who aren’t “fulltime writers.” You
            shouldn’t have to quit your job to write.
          </p>
          <a
            href="#interest"
            className="mt-2 flex min-h-[52px] items-center justify-center gap-3 bg-cream px-[26px] text-[19px] tracking-[0.02em] text-ink no-underline md:hidden"
          >
            Express interest
            <svg aria-hidden="true" width="12" height="18" viewBox="0 0 12 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 0v16M1 11l5 5 5-5" />
            </svg>
          </a>
        </div>
        <Calendar />
      </section>

      <section className="flex flex-col gap-[clamp(16px,2.8vh,36px)] px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)]">
        <ol aria-label="How it works" className="flex flex-col gap-[clamp(8px,1.8vh,20px)]">
          {RULES.map((r) => (
            <li key={r.numeral} className="grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-3">
              <span aria-hidden="true" className="wonk font-display text-[clamp(26px,4.4vh,32px)] font-semibold text-brass-numeral">
                {r.numeral}
              </span>
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-[clamp(19px,3.1vh,22px)] font-[450]">{r.title}</h3>
                <p className="text-[clamp(15px,2.4vh,17px)] leading-[1.4] text-ink-muted">{r.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <InterestForm />

        <footer className="mt-auto flex flex-wrap justify-between gap-x-6 gap-y-2 text-[15px] text-ink-muted">
          <span>
            Inspired by <a href="https://www.inkhaven.blog/">Inkhaven</a> and{" "}
            <a href="https://en.wikipedia.org/wiki/National_Novel_Writing_Month">NaNoWriMo</a>.
          </span>
          <span>
            by Austin of <a href="https://manifund.org">Manifund</a>
          </span>
        </footer>
      </section>
    </main>
  );
}
