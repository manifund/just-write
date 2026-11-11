import Link from "next/link";
import type { ReactNode } from "react";
import { isSafeSrc, type RichNode } from "@/convex/lib/richtext";
import { chatLinkClick } from "@/lib/chat-url";
import { ChatImage } from "./image-viewer";

// Renders a (server-cleaned) Tiptap JSON document as React elements, without raw HTML.
export function RichText({ body }: { body: string }) {
  let doc: RichNode;
  try {
    doc = JSON.parse(body);
  } catch {
    return null;
  }
  return (
    <div className="rich">
      {groupImages(normalizeBlocks(doc.content ?? [])).map((n, i) =>
        Array.isArray(n) ? (
          <div key={i} className="flex flex-wrap gap-2">
            {n.map((img, j) => renderImage(img, j))}
          </div>
        ) : (
          renderNode(n, i)
        ),
      )}
    </div>
  );
}

// Writers mark paragraph breaks with blank lines (an empty paragraph, or two
// Shift+Enter breaks in a row). Rendered literally those take a full line plus
// margins, so turn them into plain paragraph boundaries and let the block gap
// in `.rich` do the spacing.
function normalizeBlocks(blocks: RichNode[]): RichNode[] {
  const out: RichNode[] = [];
  for (const b of blocks) {
    if (b.type !== "paragraph") {
      out.push(b);
      continue;
    }
    for (const part of splitOnDoubleBreaks(b.content ?? [])) {
      if (part.some((c) => !isBlank(c))) out.push({ ...b, content: part });
    }
  }
  return out.length ? out : blocks;
}

// Images next to each other share a row.
function groupImages(blocks: RichNode[]): (RichNode | RichNode[])[] {
  const out: (RichNode | RichNode[])[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type !== "image") out.push(b);
    else if (Array.isArray(last)) last.push(b);
    else out.push([b]);
  }
  return out;
}

function renderImage(n: RichNode, key: number): ReactNode {
  const src = n.attrs?.src;
  if (!isSafeSrc(src)) return null;
  const w = Number(n.attrs?.width) || undefined;
  const h = Number(n.attrs?.height) || undefined;
  return <ChatImage key={key} src={src} width={w} height={h} />;
}

function splitOnDoubleBreaks(inline: RichNode[]): RichNode[][] {
  const parts: RichNode[][] = [[]];
  for (let i = 0; i < inline.length; i++) {
    const c = inline[i];
    if (c.type === "hardBreak" && inline[i + 1]?.type === "hardBreak") {
      while (inline[i + 1]?.type === "hardBreak") i++;
      parts.push([]);
      continue;
    }
    parts[parts.length - 1].push(c);
  }
  // Drop breaks left dangling at either end of each part.
  return parts.map((p) => {
    while (p[0]?.type === "hardBreak") p.shift();
    while (p[p.length - 1]?.type === "hardBreak") p.pop();
    return p;
  });
}

function isBlank(c: RichNode): boolean {
  return (
    c.type === "hardBreak" ||
    (c.type === "text" && (c.text ?? "").trim() === "")
  );
}

function renderNode(n: RichNode, key: number): ReactNode {
  const kids = (n.content ?? []).map((c, i) => renderNode(c, i));
  switch (n.type) {
    case "paragraph":
      return <p key={key}>{kids.length ? kids : <br />}</p>;
    case "text":
      return renderMarks(n, key);
    case "hardBreak":
      return <br key={key} />;
    case "heading":
      return n.attrs?.level === 1 ? (
        <h3 key={key}>{kids}</h3>
      ) : (
        <h4 key={key}>{kids}</h4>
      );
    case "blockquote":
      return <blockquote key={key}>{kids}</blockquote>;
    case "bulletList":
      return <ul key={key}>{kids}</ul>;
    case "orderedList":
      return (
        <ol
          key={key}
          start={typeof n.attrs?.start === "number" ? n.attrs.start : undefined}
        >
          {kids}
        </ol>
      );
    case "listItem":
      return <li key={key}>{kids}</li>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{(n.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "mention":
      return (
        <span key={key} className="mention">
          @{String(n.attrs?.label ?? "")}
        </span>
      );
    default:
      return null;
  }
}

function renderMarks(n: RichNode, key: number): ReactNode {
  let out: ReactNode = n.text ?? "";
  for (const m of n.marks ?? []) {
    switch (m.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link": {
        const href = String(m.attrs?.href ?? "");
        const local = sitePath(href);
        if (local) {
          // Links to this site (e.g. a copied message link) navigate in place.
          out = (
            <Link href={local} onClick={(e) => chatLinkClick(e, local)}>
              {out}
            </Link>
          );
        } else if (/^(https?:|mailto:)/i.test(href)) {
          out = (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
            >
              {out}
            </a>
          );
        } else if (/^\/(?!\/)/.test(href)) {
          // In-site links (only Claude's posts have these; cleanBody drops them from members').
          out = (
            <Link href={href} onClick={(e) => chatLinkClick(e, href)}>
              {out}
            </Link>
          );
        }
        break;
      }
    }
  }
  return <span key={key}>{out}</span>;
}

const SITE_HOSTS = new Set(["justwrite.club", "www.justwrite.club"]);

// The path of a full justwrite.club URL, so it can open with client-side navigation.
function sitePath(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!SITE_HOSTS.has(url.hostname)) return null;
  return url.pathname + url.search + url.hash;
}
