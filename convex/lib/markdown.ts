// Turns the small Markdown subset @Claude writes for a chat-task draft into a Tiptap
// document (the same shape the composer sends). The result still goes through
// richtext.cleanBody, like any message from a browser. Dependency-free.
//
// Blocks: paragraphs (single newlines become line breaks), "#" headings (the composer
// has two sizes: "#" and "##" or more), "-", "*", "+" and "1." lists (nested items are
// flattened), "> " quotes, ``` fences, "---" rules, and tables (shown as a monospace
// block with padded columns). Inline: **bold**, __bold__, *italic*, _italic_,
// ~~strike~~, `code`, [text](https://...), bare https:// links, images as links, and
// @handle mentions. Only https links are kept.
import type { RichNode } from "./richtext";

// Returns the member a handle names, or null to leave "@handle" as plain text.
export type ResolveMention = (handle: string) => { id: string; label: string } | null;

type Mark = NonNullable<RichNode["marks"]>[number];

const FENCE = /^\s*```/;
const HEADING = /^\s*(#{1,6})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const isBlockStart = (line: string) =>
  FENCE.test(line) ||
  TABLE_ROW.test(line) ||
  HEADING.test(line) ||
  RULE.test(line) ||
  QUOTE.test(line) ||
  BULLET.test(line) ||
  ORDERED.test(line);

export function markdownToDoc(
  md: string,
  resolve: ResolveMention,
  mentionLimit = 10,
): RichNode {
  let mentions = 0;
  const mention = (handle: string) => {
    if (mentions >= mentionLimit) return null;
    const m = resolve(handle.toLowerCase());
    if (m) mentions++;
    return m;
  };
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  return { type: "doc", content: blocks(lines, mention) };
}

function blocks(lines: string[], mention: ResolveMention): RichNode[] {
  const out: RichNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++; // the closing fence, if any
      const text = code.join("\n");
      out.push(
        text
          ? { type: "codeBlock", content: [{ type: "text", text }] }
          : { type: "codeBlock" },
      );
      continue;
    }

    if (TABLE_ROW.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        const l = lines[i++];
        if (TABLE_RULE.test(l)) continue;
        rows.push(
          l
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim().replace(/\*\*|__|`/g, "")),
        );
      }
      const widths = rows[0].map((_, c) =>
        Math.max(...rows.map((r) => (r[c] ?? "").length)),
      );
      const text = rows
        .map((r) =>
          widths
            .map((w, c) => (r[c] ?? "").padEnd(w))
            .join("  ")
            .trimEnd(),
        )
        .join("\n");
      out.push({ type: "codeBlock", content: [{ type: "text", text }] });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const content = inline(heading[2].replace(/\s+#+\s*$/, ""), [], mention);
      if (content.length)
        out.push({
          type: "heading",
          attrs: { level: Math.min(heading[1].length, 2) },
          content,
        });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]))
        quoted.push(lines[i++].replace(QUOTE, ""));
      const content = blocks(quoted, mention);
      if (content.length) out.push({ type: "blockquote", content });
      continue;
    }

    const bullet = BULLET.test(line);
    const ordered = line.match(ORDERED);
    if (bullet || ordered) {
      const pattern = bullet ? BULLET : ORDERED;
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(pattern);
        if (m) {
          items.push([bullet ? m[1] : m[2]]);
          i++;
        } else if (
          l.trim() &&
          !isBlockStart(l) &&
          /^\s+/.test(l) &&
          items.length
        ) {
          // An indented line continues the item above it.
          items[items.length - 1].push(l.trim());
          i++;
        } else if (
          // A nested list of the other kind is flattened into this one.
          l.trim() &&
          /^\s{2,}/.test(l) &&
          (BULLET.test(l) || ORDERED.test(l))
        ) {
          const n = l.match(BULLET) ?? l.match(ORDERED)!;
          items.push([n[n.length - 1]]);
          i++;
        } else break;
      }
      const content = items
        .map((item) => paragraph(item, mention))
        .filter((p): p is RichNode => p !== null)
        .map((p) => ({ type: "listItem", content: [p] }));
      if (content.length)
        out.push(
          ordered
            ? {
                type: "orderedList",
                attrs: { start: Number(ordered[1]) || 1 },
                content,
              }
            : { type: "bulletList", content },
        );
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]))
      para.push(lines[i++].trim());
    const p = paragraph(para, mention);
    if (p) out.push(p);
  }
  return out;
}

// One paragraph; each source line after the first starts after a line break.
function paragraph(lines: string[], mention: ResolveMention): RichNode | null {
  const content: RichNode[] = [];
  lines.forEach((l, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    content.push(...inline(l, [], mention));
  });
  return content.some((c) => c.type !== "hardBreak")
    ? { type: "paragraph", content }
    : null;
}

// Inline tokens, earliest match first. Groups:
// 1 code, 2 **bold**, 3 __bold__, 4 ~~strike~~, 5 *italic*, 6 _italic_,
// 7–8 [text](url) or ![alt](url), 9 bare URL, 10 @handle.
const INLINE =
  /`([^`\n]+)`|\*\*(?=\S)(.+?)\*\*|(?<![\w])__(?=\S)(.+?)__(?![\w])|~~(?=\S)(.+?)~~|\*(?=[^\s*])(.+?)\*|(?<![\w])_(?=[^\s_])(.+?)_(?![\w])|!?\[([^\]\n]+)\]\(\s*(https:\/\/(?:[^\s()]|\([^\s()]*\))+)\s*\)|(https:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])|(?<![\w@./])@([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)(?![\w-])/gi;

function inline(
  s: string,
  marks: Mark[],
  mention: ResolveMention,
  inLink = false,
): RichNode[] {
  const out: RichNode[] = [];
  const text = (t: string, extra: Mark[] = []) => {
    if (!t) return;
    const all = [...marks, ...extra];
    out.push(all.length ? { type: "text", text: t, marks: all } : { type: "text", text: t });
  };
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    const at = m.index;
    const [whole, code, bold1, bold2, strike, em1, em2, label, href, url, handle] = m;
    // Links and mentions don't nest inside a link's text.
    if (inLink && (label || url || handle)) continue;
    text(s.slice(last, at));
    last = at + whole.length;
    if (code !== undefined) text(code, [{ type: "code" }]);
    else if (bold1 ?? bold2)
      out.push(...inline((bold1 ?? bold2)!, [...marks, { type: "bold" }], mention, inLink));
    else if (strike !== undefined)
      out.push(...inline(strike, [...marks, { type: "strike" }], mention, inLink));
    else if (em1 ?? em2)
      out.push(...inline((em1 ?? em2)!, [...marks, { type: "italic" }], mention, inLink));
    else if (label !== undefined)
      out.push(
        ...inline(label, [...marks, { type: "link", attrs: { href } }], mention, true),
      );
    else if (url !== undefined) text(url, [{ type: "link", attrs: { href: url } }]);
    else if (handle !== undefined) {
      const who = mention(handle);
      if (who) out.push({ type: "mention", attrs: { id: who.id, label: who.label } });
      else text(whole);
    }
  }
  text(s.slice(last));
  return out;
}
