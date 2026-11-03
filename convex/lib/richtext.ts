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
  "image",
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

export function isSafeSrc(src: unknown): src is string {
  return typeof src === "string" && /^https:\/\//i.test(src);
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

  const walk = (n: RichNode, parent?: string): RichNode | null => {
    if (!n || typeof n.type !== "string" || !NODES.has(n.type)) return null;
    if (n.type === "image" && parent !== "doc") return null; // images are top-level blocks only
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
    if (n.type === "image") {
      // An uploaded image. The server swaps `src` for the stored file's URL
      // (chat.ts#withImages), so only `id` is trusted from the client.
      const dim = (x: unknown) =>
        typeof x === "number" && x > 0 ? Math.min(Math.round(x), 10_000) : null;
      out.attrs = {
        id: String(n.attrs?.id ?? ""),
        src: isSafeSrc(n.attrs?.src) ? n.attrs!.src : null,
        width: dim(n.attrs?.width),
        height: dim(n.attrs?.height),
      };
      return out;
    }
    if (n.type === "mention") {
      out.attrs = {
        id: String(n.attrs?.id ?? ""),
        label: String(n.attrs?.label ?? ""),
      };
      return out;
    }
    if (n.content)
      out.content = n.content
        .map((c) => walk(c, n.type))
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
  if (n.type === "image") return "(image)";
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
