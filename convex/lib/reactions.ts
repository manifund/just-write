import ordered from "unicode-emoji-json/data-ordered-emoji.json";

// The quick reactions shown first on every chat message. The first four
// appear in the hover bar; all of them lead the emoji picker.
export const REACTIONS = ["❤️", "👍", "👎", "😂", "🔥", "👏", "✍️", "👀"];

// Any standard emoji can be used as a reaction.
const ALL = new Set<string>([...REACTIONS, ...ordered]);

export function isReaction(emoji: string) {
  return ALL.has(emoji);
}
