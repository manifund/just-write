"use client";

import { Extension, type JSONContent } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicMember } from "@/convex/lib/viewer";
import { Avatar } from "./avatar";
import { usePortal } from "./context";

type MentionState = {
  items: PublicMember[];
  index: number;
  rect: DOMRect | null;
  command: (m: PublicMember) => void;
} | null;

export function Composer({
  placeholder,
  onSend,
  onTyping,
  onCancel,
  initial,
  autoFocus,
  submitLabel = "Send",
  compact,
}: {
  placeholder: string;
  onSend: (body: string) => Promise<void>;
  onTyping?: () => void;
  onCancel?: () => void;
  initial?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  compact?: boolean;
}) {
  const { roster, me } = usePortal();
  const [mention, setMention] = useState<MentionState>(null);
  // Tiptap's callbacks are set up once, when the editor is created, so they read
  // the latest props and state through these refs (kept current by the effect below).
  const rosterRef = useRef(roster);
  const mentionRef = useRef<MentionState>(null);
  const sendRef = useRef<() => void>(() => {});
  const cancelRef = useRef(onCancel);
  const typingRef = useRef(onTyping);

  const editor = useEditor({
    // The portal only renders in the browser, so the editor can render on the first
    // pass instead of popping in after mount.
    immediatelyRender: true,
    autofocus: autoFocus ? "end" : false,
    content: initial ? JSON.parse(initial) : undefined,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
        },
      }),
      Placeholder.configure({ placeholder }),
      // eslint-disable-next-line react-hooks/refs -- the refs are only read inside editor callbacks, never during render
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        renderText: ({ node }) => `@${node.attrs.label}`,
        suggestion: {
          items: ({ query }) => {
            const q = query.toLowerCase();
            return [...rosterRef.current.values()]
              .filter(
                (m) => m._id !== me._id && m.name.toLowerCase().includes(q),
              )
              .slice(0, 6);
          },
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "mention",
                  attrs: { id: props.id, label: props.label },
                },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => {
            const update = (p: SuggestionProps<PublicMember>) =>
              setMention((prev) => ({
                items: p.items,
                index:
                  prev && prev.items.length === p.items.length ? prev.index : 0,
                rect: p.clientRect?.() ?? null,
                command: (m) => p.command({ id: m._id, label: m.name }),
              }));
            return {
              onStart: update,
              onUpdate: update,
              onExit: () => setMention(null),
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const s = mentionRef.current;
                if (!s || s.items.length === 0) return false;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  const d = event.key === "ArrowDown" ? 1 : -1;
                  setMention({
                    ...s,
                    index: (s.index + d + s.items.length) % s.items.length,
                  });
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  s.command(s.items[s.index]);
                  return true;
                }
                if (event.key === "Escape") {
                  setMention(null);
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
      // Enter sends, Shift+Enter breaks the line (lists and code blocks keep their own Enter).
      Extension.create({
        name: "sendOnEnter",
        priority: 1000, // ahead of the built-in Enter (split paragraph)
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => {
              if (mentionRef.current) return false;
              if (editor.isActive("codeBlock") || editor.isActive("listItem"))
                return false;
              sendRef.current();
              return true;
            },
            "Mod-Enter": () => {
              sendRef.current();
              return true;
            },
            Escape: () => {
              if (cancelRef.current) {
                cancelRef.current();
                return true;
              }
              return false;
            },
          };
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: `rich composer-input ${compact ? "max-h-[30vh]" : "max-h-[40vh]"} min-h-[24px] overflow-y-auto outline-none`,
        "aria-label": placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      if (!editor.isEmpty) typingRef.current?.();
    },
  });

  // Clears right away and doesn't wait for the server, so you can keep sending.
  const send = async () => {
    if (!editor || editor.isEmpty) return;
    const json: JSONContent = editor.getJSON();
    const body = JSON.stringify(json);
    editor.commands.clearContent(true);
    try {
      await onSend(body);
    } catch (err) {
      // Put the draft back so nothing is lost, unless you've started a new one.
      if (!editor.isDestroyed && editor.isEmpty)
        editor.commands.setContent(json);
      throw err;
    }
  };

  useLayoutEffect(() => {
    rosterRef.current = roster;
    mentionRef.current = mention;
    cancelRef.current = onCancel;
    typingRef.current = onTyping;
    sendRef.current = send;
  });

  const isEmpty = useEditorState({
    editor,
    selector: (s) => s.editor?.isEmpty ?? true,
  });

  useEffect(() => {
    if (autoFocus) editor?.commands.focus("end");
  }, [autoFocus, editor]);

  return (
    <div className="relative">
      <div className="flex flex-col border border-ink/25 bg-cream transition-colors focus-within:border-ink/60">
        <EditorContent
          editor={editor}
          className="px-3.5 pt-3 pb-1.5 text-[17px]"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <Toolbar editor={editor} />
          <span className="ml-auto hidden pr-2 text-[13px] text-ink-muted sm:inline">
            {onCancel ? "Esc to cancel · " : ""}Shift+Enter for a new line
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer px-3 py-1.5 text-[15px] text-ink-muted underline sm:hidden"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={isEmpty}
            className="cursor-pointer bg-ink px-4 py-1.5 text-[15px] text-cream transition-[background-color,opacity] enabled:hover:bg-ink-muted disabled:cursor-default disabled:opacity-35"
          >
            {submitLabel}
          </button>
        </div>
      </div>
      {mention && mention.items.length > 0 && mention.rect && (
        <ul
          role="listbox"
          className="fixed z-50 w-64 border border-ink/20 bg-cream py-1 shadow-[0_8px_24px_-8px_rgb(56_33_63/0.35)]"
          style={{
            left: mention.rect.left,
            bottom: window.innerHeight - mention.rect.top + 6,
          }}
        >
          {mention.items.map((m, i) => (
            <li key={m._id} role="option" aria-selected={i === mention.index}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  mention.command(m);
                }}
                className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-[16px] ${
                  i === mention.index ? "bg-cream-deep" : ""
                }`}
              >
                <Avatar member={m} size={22} /> {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: (s) => ({
      bold: s.editor?.isActive("bold") ?? false,
      italic: s.editor?.isActive("italic") ?? false,
      strike: s.editor?.isActive("strike") ?? false,
      code: s.editor?.isActive("code") ?? false,
      link: s.editor?.isActive("link") ?? false,
      bullet: s.editor?.isActive("bulletList") ?? false,
      quote: s.editor?.isActive("blockquote") ?? false,
    }),
  });
  if (!editor || !state) return null;

  const btn = (active: boolean) =>
    `flex size-8 cursor-pointer items-center justify-center text-[15px] transition-colors hover:bg-cream-deep ${
      active ? "bg-cream-deep text-ink" : "text-ink-muted"
    }`;

  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Link to:");
    if (!href) return;
    const url = /^(https?:|mailto:)/i.test(href) ? href : `https://${href}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role="toolbar"
      aria-label="Formatting"
    >
      <button
        type="button"
        title="Bold (⌘B)"
        aria-pressed={state.bold}
        className={`${btn(state.bold)} font-bold`}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </button>
      <button
        type="button"
        title="Italic (⌘I)"
        aria-pressed={state.italic}
        className={`${btn(state.italic)} italic`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        I
      </button>
      <button
        type="button"
        title="Strikethrough"
        aria-pressed={state.strike}
        className={`${btn(state.strike)} line-through`}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        S
      </button>
      <button
        type="button"
        title="Link"
        aria-pressed={state.link}
        className={btn(state.link)}
        onClick={toggleLink}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
      </button>
      <span className="hidden items-center gap-0.5 sm:flex">
        <button
          type="button"
          title="Code"
          aria-pressed={state.code}
          className={`${btn(state.code)} font-mono text-[13px]`}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {"</>"}
        </button>
        <button
          type="button"
          title="Bulleted list"
          aria-pressed={state.bullet}
          className={btn(state.bullet)}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          ••
        </button>
        <button
          type="button"
          title="Quote"
          aria-pressed={state.quote}
          className={`${btn(state.quote)} font-display text-[20px]`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “
        </button>
      </span>
    </div>
  );
}
