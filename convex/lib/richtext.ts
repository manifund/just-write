import { ConvexError } from "convex/values";

// A Tiptap/ProseMirror JSON node.
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};

export const emptyDoc: RichNode = { type: "doc", content: [] };

const NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "mention",
]);
const MARKS = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "underline",
]);
const MAX_BODY = 40_000;

function isSafeHref(href: unknown) {
  return typeof href === "string" && /^(https?:|mailto:)/i.test(href);
}

// Checks a message body from the client: allowed node and mark types only, http(s) links only.
// Returns the cleaned JSON string and its plain text.
export function cleanBody(raw: string): { body: string; text: string } {
  if (raw.length > MAX_BODY) throw new ConvexError("That message is too long.");
  let doc: RichNode;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new ConvexError("Couldn’t read that message.");
  }
  if (doc?.type !== "doc") throw new ConvexError("Couldn’t read that message.");

  const walk = (n: RichNode): RichNode | null => {
    if (!n || typeof n.type !== "string" || !NODES.has(n.type)) return null;
    const out: RichNode = { type: n.type };
    if (n.type === "text") {
      if (typeof n.text !== "string" || !n.text) return null;
      out.text = n.text;
      const marks = (n.marks ?? [])
        .filter((m) => MARKS.has(m.type))
        .filter((m) => m.type !== "link" || isSafeHref(m.attrs?.href))
        .map((m) =>
          m.type === "link"
            ? { type: "link", attrs: { href: m.attrs!.href } }
            : { type: m.type },
        );
      if (marks.length) out.marks = marks;
      return out;
    }
    if (n.type === "heading") {
      const level = Number(n.attrs?.level);
      out.attrs = { level: level >= 1 && level <= 3 ? level : 3 };
    }
    if (n.type === "orderedList" && typeof n.attrs?.start === "number")
      out.attrs = { start: n.attrs.start };
    if (n.type === "mention") {
      out.attrs = {
        id: String(n.attrs?.id ?? ""),
        label: String(n.attrs?.label ?? ""),
      };
      return out;
    }
    if (n.content)
      out.content = n.content
        .map(walk)
        .filter((c): c is RichNode => c !== null);
    return out;
  };

  const clean = walk(doc)!;
  const text = plainText(clean).trim();
  return { body: JSON.stringify(clean), text };
}

export function plainText(n: RichNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  if (n.type === "mention") return `@${n.attrs?.label ?? ""}`;
  const inner = (n.content ?? [])
    .map(plainText)
    .join(n.type === "doc" || n.type.endsWith("List") ? "\n" : "");
  return inner;
}

// Member ids mentioned in a document.
export function mentionIds(n: RichNode): string[] {
  if (n.type === "mention") return [String(n.attrs?.id ?? "")];
  return (n.content ?? []).flatMap(mentionIds);
}
