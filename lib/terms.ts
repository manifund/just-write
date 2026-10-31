// The commitment terms. The /commit page and the signed-terms email both render from this,
// so the copy a writer receives always matches what they agreed to.

// A run of text, optionally a link.
export type Run = string | { text: string; href: string };
export type Rich = string | Run[];

export type Term = {
  title: string;
  intro?: Rich;
  bullets?: Rich[];
  outro?: Rich[];
};

export const TERMS: Term[] = [
  {
    title: "Publish 4 essays",
    intro:
      "To join Just Write, you commit to publish 4 essays in the month of November 2026:",
    bullets: [
      "Essays are due on or before Mondays, 9pm PT: Nov 9, 16, 23, and 30.",
      "Essays must be 1000 words or more.",
      "Essays must be posted on the public internet (personal website, company blog, Substack, X, LessWrong, etc).",
      "Essay URLs must be registered through the Just Write portal.",
      "Essays may be featured on the Just Write public website.",
    ],
  },
  {
    title: "Deposit $1,000",
    intro: [
      "To enforce this publishing commitment, you will deposit $1000 with ",
      { text: "Manifund", href: "https://manifund.org" },
      " (legally Manifold for Charity, a 501c3 nonprofit, EIN 88-3668801), as a credit card payment via Stripe.",
    ],
    bullets: [
      "If you succeed at publishing 4 essays before their respective deadlines, Manifund will refund this credit card payment, on or around Dec 2, 2026. (Manifund will pay any associated refund fees.)",
      "If you miss any essay deadline, the $1000 becomes an unrestricted donation to Manifund. We’ll send you a receipt; check with your tax advisor on tax-deductibility. (You may continue in the program after this point, if you so wish.)",
    ],
    outro: ["Austin (and his Claude) will adjudicate any edge cases."],
  },
  {
    title: "The spirit of the club",
    outro: [
      "We encourage you to write evergreen, ambitious essays, which you will look back on with pride. But we can’t and won’t enforce that. If you fulfill your commitment via LLM slop, or the word “essay” repeated 1000 times, that will be between you and your reputation.",
    ],
  },
  {
    title: "What we’ll offer",
    intro: "Just Write also plans to offer the following (optional) features:",
    bullets: [
      "An online platform to chat with other participants (eg Discord, or a new internal forum)",
      "Daily check-ins, where you share 100 words of your recent writing",
      "Weekly writing circles, online & in SF on Saturday",
      "A wrap party in SF, on the evening of Wed Dec 2",
    ],
  },
];

export function runs(rich: Rich): Run[] {
  return typeof rich === "string" ? [rich] : rich;
}
