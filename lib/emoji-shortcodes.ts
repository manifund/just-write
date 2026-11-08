// Slack-style emoji shortcodes, like :thinking: or :+1:. Every emoji gets its
// Unicode name as a code (thinking_face), the same name without "_face"
// (thinking), and the common Slack names below.

type Entry = { emoji: string; codes: string[] };
type Group = { slug: string; emojis: { emoji: string; slug: string }[] };

const SLACK: Record<string, string[]> = {
  "😂": ["joy"],
  "🤣": ["rofl"],
  "😄": ["smile"],
  "😃": ["smiley"],
  "😁": ["grin"],
  "😆": ["laughing", "satisfied"],
  "😅": ["sweat_smile"],
  "😊": ["blush"],
  "🙂": ["slightly_smiling_face"],
  "😉": ["wink"],
  "😍": ["heart_eyes"],
  "🥰": ["smiling_face_with_3_hearts"],
  "😘": ["kissing_heart"],
  "😎": ["sunglasses"],
  "🤗": ["hugs", "hugging_face"],
  "😏": ["smirk"],
  "😒": ["unamused"],
  "😕": ["confused"],
  "😢": ["cry"],
  "😭": ["sob"],
  "😱": ["scream"],
  "😡": ["rage"],
  "😠": ["angry"],
  "😮": ["open_mouth"],
  "😴": ["sleeping"],
  "😬": ["grimacing"],
  "🙃": ["upside_down_face"],
  "👍": ["+1", "thumbsup"],
  "👎": ["-1", "thumbsdown"],
  "❤️": ["heart"],
  "💔": ["broken_heart"],
  "🎉": ["tada"],
  "🙏": ["pray"],
  "👏": ["clap"],
  "🙌": ["raised_hands"],
  "💪": ["muscle"],
  "👋": ["wave"],
  "👀": ["eyes"],
  "💯": ["100"],
  "✅": ["white_check_mark"],
  "✔️": ["heavy_check_mark"],
  "❌": ["x"],
  "⚠️": ["warning"],
  "⭐": ["star"],
  "🌟": ["star2"],
  "💡": ["bulb"],
  "📝": ["memo", "pencil"],
  "✏️": ["pencil2"],
  "☕": ["coffee"],
  "☝️": ["point_up"],
  "👉": ["point_right"],
  "👈": ["point_left"],
  "👆": ["point_up_2"],
  "👇": ["point_down"],
  "🤷": ["shrug"],
  "🤦": ["facepalm"],
  "🫡": ["salute"],
  "😤": ["triumph"],
  "🥲": ["smiling_face_with_tear"],
  "🤯": ["exploding_head", "mind_blown"],
  "💀": ["skull"],
  "🔥": ["fire"],
};

let byCode: Map<string, string> | null = null;
let loading: Promise<Entry[]> | null = null;

export function loadShortcodes(): Promise<Entry[]> {
  loading ??= import("unicode-emoji-json/data-by-group.json").then((mod) => {
    const groups = mod.default as Group[];
    const list: Entry[] = [];
    const map = new Map<string, string>();
    const add = (code: string, emoji: string, entry: Entry) => {
      if (map.has(code)) return;
      map.set(code, emoji);
      entry.codes.push(code);
    };
    for (const g of groups) {
      if (g.slug === "component") continue;
      for (const e of g.emojis) {
        const entry: Entry = { emoji: e.emoji, codes: [] };
        for (const c of SLACK[e.emoji] ?? []) add(c, e.emoji, entry);
        if (e.slug.endsWith("_face")) add(e.slug.slice(0, -5), e.emoji, entry);
        add(e.slug, e.emoji, entry);
        if (entry.codes.length) list.push(entry);
      }
    }
    byCode = map;
    return list;
  });
  return loading;
}

/** The emoji for a full shortcode (without colons), once the list has loaded. */
export function emojiFor(code: string): string | undefined {
  return byCode?.get(code.toLowerCase());
}

export type ShortcodeMatch = { emoji: string; code: string };

/** Up to `limit` emoji whose codes start with the query (exact and shorter
 * codes first), then ones that contain it. */
export function searchShortcodes(
  list: Entry[],
  query: string,
  limit = 6,
): ShortcodeMatch[] {
  const q = query.toLowerCase();
  const starts: ShortcodeMatch[] = [];
  const contains: ShortcodeMatch[] = [];
  for (const e of list) {
    const s = e.codes.find((c) => c.startsWith(q));
    if (s) starts.push({ emoji: e.emoji, code: s });
    else if (contains.length < limit) {
      const c = e.codes.find((c) => c.includes(q));
      if (c) contains.push({ emoji: e.emoji, code: c });
    }
  }
  starts.sort((a, b) => a.code.length - b.code.length);
  return [...starts, ...contains].slice(0, limit);
}
