import { Calendar } from "./calendar";
import { InterestForm } from "./interest-form";

const RULES = [
  {
    numeral: "i.",
    title: "Publish 100+ words each day",
    detail: "On X, LW, personal blog, etc. Deadline: noon PT. One “grace day” each week.",
  },
  {
    numeral: "ii.",
    title: "Publish 1000+ word essay each week",
    detail:
      "Aiming for a timeless, high quality essay. Can reuse words from previous shortforms. Deadline: noon PT the following Monday.",
  },
  {
    numeral: "iii.",
    title: "$1k deposit required",
    detail: "Refunded if you succeed.",
  },
  {
    numeral: "iv.",
    title: "Remote by default",
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

export default function Home() {
  return (
    <main className="grid min-h-[58.75rem] grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))]">
      <section className="relative flex flex-col gap-10 overflow-hidden bg-ink p-[clamp(28px,4vw,56px)] text-cream">
        <InkWash />
        <div className="relative font-display text-[25px] font-medium tracking-[-0.01em]">
          Just Write
        </div>
        <div className="relative flex flex-col gap-[22px]">
          <p className="text-sm tracking-[0.14em] text-brass-light uppercase">
            4-week online writing club
          </p>
          <h1 className="max-w-[8.5em] font-display text-[clamp(48px,5.4vw,80px)] leading-none font-[340] tracking-[-0.025em] text-balance">
            Everyone has a <em className="wonk text-brass-light">great essay</em> in them.
          </h1>
          <p className="max-w-[28em] text-xl leading-[1.45] text-pretty text-wash-light">
            We especially want to hear from people who aren’t “fulltime writers.” You
            shouldn’t have to quit your job to write.
          </p>
        </div>
        <Calendar />
      </section>

      <section className="flex flex-col gap-9 px-[clamp(24px,5vw,72px)] py-[clamp(28px,4vw,56px)]">
        <p className="text-[15px] tracking-[0.14em] text-brass-text uppercase">
          Nov 1 – Dec 1, 2026 · Remote + SF
        </p>
        <ol aria-label="How it works" className="flex flex-col gap-5">
          {RULES.map((r) => (
            <li key={r.numeral} className="grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-3">
              <span aria-hidden="true" className="wonk font-display text-[32px] text-brass-numeral">
                {r.numeral}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-[23px] font-[450]">{r.title}</h3>
                <p className="text-[17px] leading-[1.45] text-ink-muted">{r.detail}</p>
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
            A <a href="https://manifund.org">Manifund</a> project · justwrite.club
          </span>
        </footer>
      </section>
    </main>
  );
}
