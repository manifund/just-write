import type { ReactNode } from "react";
import type { RichNode } from "@/convex/lib/richtext";

// Renders a (server-cleaned) Tiptap JSON document as React elements, without raw HTML.
export function RichText({ body }: { body: string }) {
  let doc: RichNode;
  try {
    doc = JSON.parse(body);
  } catch {
    return null;
  }
  return <div className="rich">{(doc.content ?? []).map((n, i) => renderNode(n, i))}</div>;
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
      return n.attrs?.level === 1 ? <h3 key={key}>{kids}</h3> : <h4 key={key}>{kids}</h4>;
    case "blockquote":
      return <blockquote key={key}>{kids}</blockquote>;
    case "bulletList":
      return <ul key={key}>{kids}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={typeof n.attrs?.start === "number" ? n.attrs.start : undefined}>
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
        if (/^(https?:|mailto:)/i.test(href)) {
          out = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
              {out}
            </a>
          );
        }
        break;
      }
    }
  }
  return <span key={key}>{out}</span>;
}
