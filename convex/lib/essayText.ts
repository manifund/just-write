// Reading the text of an essay's page, and the word cloud built from everyone's essays
// (convex/themes.ts, convex/themesAction.ts). No imports, so it runs in any runtime.

// Longest text kept per essay (about 3,500 words).
export const TEXT_MAX = 20_000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : Number(e.slice(1));
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;

// The main text of an essay page: prefers <article>, drops scripts, styles, and page chrome.
// Null when there's too little text to be an essay (a sign-in wall, a page built by scripts).
export function essayText(html: string): string | null {
  const body =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<body[\s\S]*<\/body>/i)?.[0] ??
    html;
  const text = decode(
    body
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|svg|nav|header|footer|form|button|aside|figcaption|template|iframe)\b[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return (text.match(WORD)?.length ?? 0) >= 150
    ? text.slice(0, TEXT_MAX)
    : null;
}

// Words left out of the cloud: common English words, words that say little about a topic,
// and the buttons blogs put around a post.
const STOP = new Set(
  `able about above across actually after again against ago ahead all almost alone along already also although always among amongst and another any anybody anyone anything anyway anywhere are aren't around aside ask asked asking away
  back be became because become becomes been before began begin behind being believe below beside besides best better between beyond big bit both bring brought but by
  call called came can can't cannot certain certainly clear clearly come comes coming could couldn't
  day days did didn't different do does doesn't doing don't done down during
  each early easy either else end enough entire especially etc even ever every everybody everyone everything everywhere exactly example
  fact far feel feels felt few find first five for found four from full further
  gave get gets getting give given gives go goes going gone gonna good got gotten great
  had hadn't half happen happened has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how however
  i'd i'll i'm i've instead into isn't it'd it'll its itself
  just keep kept kind kinda kinds knew know known knows
  large last later least less let lets like likely little long look looked looking looks lot lots
  made main make makes making many may maybe mean means meant might mine more most mostly much must my myself
  near nearly need needed needs never new next nine no nobody none nor not nothing now nowhere
  off often oh okay old once one ones only onto or other others otherwise ought our ours ourselves out over own
  part particular per perhaps place point possible pretty probably put
  quite rather real really right
  said same saw say saying says see seem seemed seems seen several shall she she'd she'll she's should shouldn't show since six small so some somebody someone something sometimes somewhat somewhere soon sort sorts still such sure
  take taken takes taking talk tell ten than that that's the their theirs them themselves then there there's therefore these they they'd they'll they're they've thing things think thinking this those though thought three through thus to together too took toward towards tried tries true try trying turn turned two
  under unless until up upon us use used uses using usually
  very via wanna want wanted wants was wasn't way ways we we'd we'll we're we've well went were weren't what what's whatever when whenever where whether which while who who's whoever whole whom whose why will with within without won't would wouldn't
  yeah year years yes yet you you'd you'll you're you've your yours yourself yourselves
  subscribe subscribed subscription share shared sharing comment comments reply replies restack restacks like likes post posts posted newsletter substack`.split(
    /\s+/,
  ),
);

// How often an essay uses each word worth showing.
function wordCounts(text: string) {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(WORD) ?? []) {
    const w = raw
      .replace(/’/g, "'")
      .replace(/'s$/, "")
      .replace(/^[-']+|[-']+$/g, "");
    if (w.length < 3 || w.length > 30 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
}

export type CloudWord = {
  word: string;
  weight: number; // relative size in the cloud
  uses: number; // times it appears across the essays
  essays: number; // essays that use it
};

// Words that come up across everyone's essays. Each essay adds the square root of how often
// it uses a word, so one long essay can't take over, and a word has to be used by at least
// two writers (once there are a few), which also keeps bylines and names out.
export function buildCloud(
  essays: { text: string; author: string }[],
  max = 70,
): CloudWord[] {
  const counted = essays.map((e) => ({
    author: e.author,
    counts: wordCounts(e.text),
  }));
  const totals = new Map<string, number>();
  for (const { counts } of counted)
    for (const [w, n] of counts) totals.set(w, (totals.get(w) ?? 0) + n);
  // Count simple plurals with the singular when both appear ("stories" with "story").
  const base = (w: string) => {
    if (w.endsWith("ies") && totals.has(`${w.slice(0, -3)}y`))
      return `${w.slice(0, -3)}y`;
    if (w.endsWith("s") && !w.endsWith("ss") && totals.has(w.slice(0, -1)))
      return w.slice(0, -1);
    return w;
  };
  const words = new Map<
    string,
    { score: number; uses: number; essays: number; authors: Set<string> }
  >();
  for (const { author, counts } of counted) {
    const merged = new Map<string, number>();
    for (const [w, n] of counts) {
      const b = base(w);
      merged.set(b, (merged.get(b) ?? 0) + n);
    }
    for (const [w, n] of merged) {
      const s = words.get(w) ?? {
        score: 0,
        uses: 0,
        essays: 0,
        authors: new Set<string>(),
      };
      s.score += Math.sqrt(n);
      s.uses += n;
      s.essays += 1;
      s.authors.add(author);
      words.set(w, s);
    }
  }
  const writers = new Set(essays.map((e) => e.author)).size;
  return [...words.entries()]
    .filter(([, s]) => writers < 3 || s.authors.size >= 2)
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([word, s]) => ({
      word,
      weight: Math.round(s.score * 100) / 100,
      uses: s.uses,
      essays: s.essays,
    }));
}
