"use client";

import { Extension, InputRule, type JSONContent } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Transaction } from "@tiptap/pm/state";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import { useMutation } from "convex/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PublicMember } from "@/convex/lib/viewer";
import { errorMessage } from "@/lib/convex";
import { Avatar } from "./avatar";
import { usePortal } from "./context";

type MentionState = {
  items: PublicMember[];
  index: number;
  rect: DOMRect | null;
  command: (m: PublicMember) => void;
} | null;

// An image attached to the message being written. `id` is the uploaded file's
// storage id, missing while it uploads (when `src` is a local preview).
type Attachment = {
  key: string;
  id?: string;
  src: string;
  width?: number;
  height?: number;
};

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function Composer({
  placeholder,
  onSend,
  onTyping,
  onCancel,
  initial,
  autoFocus,
  submitLabel = "Send",
  compact,
  draftKey,
  wordCount,
}: {
  placeholder: string;
  onSend: (body: string) => Promise<void>;
  onTyping?: () => void;
  onCancel?: () => void;
  initial?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  compact?: boolean;
  /** Keeps unsent text in this browser under this key, e.g. per channel or thread. */
  draftKey?: string;
  /** Shows how many words the message has so far, e.g. in #check-ins. */
  wordCount?: boolean;
}) {
  const { roster, me } = usePortal();
  const storageKey = draftKey ? `jw-draft:${me._id}:${draftKey}` : null;
  const [mention, setMention] = useState<MentionState>(null);
  // Tiptap's callbacks are set up once, when the editor is created, so they read
  // the latest props and state through these refs (kept current by the effect below).
  const rosterRef = useRef(roster);
  const mentionRef = useRef<MentionState>(null);
  const sendRef = useRef<() => void>(() => {});
  const cancelRef = useRef(onCancel);
  const typingRef = useRef(onTyping);
  const filesRef = useRef<(files: File[]) => void>(() => {});
  const [start] = useState(() =>
    splitImages(
      initial
        ? (JSON.parse(initial) as JSONContent)
        : storageKey
          ? readDraft(storageKey)
          : undefined,
    ),
  );
  const [images, setImages] = useState<Attachment[]>(start.images);
  const imagesRef = useRef(images);
  const [imageError, setImageError] = useState<string | null>(null);
  const uploadUrl = useMutation(api.chat.imageUploadUrl);
  const imageUrl = useMutation(api.chat.imageUrl);

  const editor = useEditor({
    // The portal only renders in the browser, so the editor can render on the first
    // pass instead of popping in after mount.
    immediatelyRender: true,
    autofocus: autoFocus ? "end" : false,
    content: start.doc,
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
      // Nested lists: Tab / Shift+Tab indent and outdent a list item (and stay in the
      // editor even when they can't, e.g. on the first item), and typing "- " at the
      // start of a list item nests it under the item above, which also works on phones.
      Extension.create({
        name: "nestLists",
        priority: 1000,
        addKeyboardShortcuts() {
          return {
            Tab: ({ editor }) => {
              if (mentionRef.current || !editor.isActive("listItem"))
                return false;
              editor.commands.sinkListItem("listItem");
              return true;
            },
            "Shift-Tab": ({ editor }) => {
              if (!editor.isActive("listItem")) return false;
              editor.commands.liftListItem("listItem");
              return true;
            },
            // Shift+Enter at the end of a bullet starts a new bullet, like Enter;
            // elsewhere in a bullet it still adds a line break.
            "Shift-Enter": ({ editor }) => {
              const { empty, $from } = editor.state.selection;
              if (
                !empty ||
                !editor.isActive("listItem") ||
                $from.parentOffset !== $from.parent.content.size
              )
                return false;
              return editor.commands.splitListItem("listItem");
            },
          };
        },
        addInputRules() {
          return [
            new InputRule({
              find: /^\s*[-+*]\s$/,
              handler: ({ state, range, chain, can }) => {
                const { $from } = state.selection;
                if (
                  $from.depth < 2 ||
                  $from.node(-1).type.name !== "listItem" ||
                  $from.index(-1) !== 0 ||
                  !can().sinkListItem("listItem")
                )
                  return null;
                chain().deleteRange(range).sinkListItem("listItem").run();
              },
            }),
          ];
        },
      }),
      // Enter sends, Shift+Enter breaks the line (lists and code blocks keep their own Enter).
      // On touch screens there's no Shift key, so Enter adds a new line and the Send button sends.
      Extension.create({
        name: "sendOnEnter",
        priority: 1000, // ahead of the built-in Enter (split paragraph)
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => {
              if (mentionRef.current) return false;
              if (editor.isActive("codeBlock") || editor.isActive("listItem"))
                return false;
              if (isTouchScreen()) return false;
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
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData);
        if (!files.length) return false;
        filesRef.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        filesRef.current(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (storageKey) writeDraft(storageKey, editor, imagesRef.current);
      if (!editor.isEmpty) typingRef.current?.();
    },
  });

  const uploading = images.some((a) => !a.id);

  // Uploads pasted, dropped, or picked images and shows them under the text.
  const addFiles = async (files: File[]) => {
    setImageError(null);
    const room = MAX_IMAGES - imagesRef.current.length;
    if (files.length > room)
      setImageError(`You can attach up to ${MAX_IMAGES} images.`);
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError("Please use an image under 10 MB.");
        continue;
      }
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      setImages((prev) => [...prev, { key, src: preview }]);
      try {
        const [size, url] = await Promise.all([
          imageSize(preview),
          uploadUrl(),
        ]);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as { storageId: string };
        const src = await imageUrl({ storageId: storageId as Id<"_storage"> });
        setImages((prev) =>
          prev.map((a) =>
            a.key === key ? { key, id: storageId, src, ...size } : a,
          ),
        );
      } catch (err) {
        setImages((prev) => prev.filter((a) => a.key !== key));
        setImageError(
          err instanceof Error && err.message === "Upload failed"
            ? "Couldn’t upload that image. Please try again."
            : errorMessage(err),
        );
      } finally {
        URL.revokeObjectURL(preview);
      }
    }
  };

  // Clears right away and doesn't wait for the server, so you can keep sending.
  const send = async () => {
    if (!editor || uploading) return;
    const sent = images;
    if (editor.isEmpty && sent.length === 0) return;
    const json: JSONContent = editor.getJSON();
    const body = JSON.stringify(withImages(json, sent));
    editor.commands.clearContent(true);
    setImages([]);
    setImageError(null);
    try {
      await onSend(body);
    } catch (err) {
      // Put the draft back so nothing is lost, unless you've started a new one.
      if (!editor.isDestroyed && editor.isEmpty) {
        editor.commands.setContent(json);
        setImages((prev) => (prev.length ? prev : sent));
      }
      throw err;
    }
  };

  // Keep the saved draft in step when images are added or removed.
  useEffect(() => {
    imagesRef.current = images;
    if (storageKey && editor && !editor.isDestroyed)
      writeDraft(storageKey, editor, images);
  }, [images, storageKey, editor]);

  useLayoutEffect(() => {
    rosterRef.current = roster;
    mentionRef.current = mention;
    cancelRef.current = onCancel;
    typingRef.current = onTyping;
    sendRef.current = send;
    filesRef.current = (files) => void addFiles(files);
  });

  const isEmpty = useEditorState({
    editor,
    selector: (s) => s.editor?.isEmpty ?? true,
  });

  const words = useEditorState({
    editor,
    selector: (s) =>
      wordCount && s.editor
        ? countWords(s.editor.getText({ blockSeparator: " " }))
        : 0,
  });

  useEffect(() => {
    if (autoFocus) editor?.commands.focus("end");
  }, [autoFocus, editor]);

  return (
    <div className="@container relative">
      <div className="flex flex-col border border-ink/25 bg-cream transition-colors focus-within:border-ink/60">
        <EditorContent
          editor={editor}
          className="px-3.5 pt-3 pb-1.5 text-[17px] leading-[1.35]"
        />
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3.5 pt-1.5 pb-1">
            {images.map((a) => (
              <div key={a.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local previews and Convex storage URLs */}
                <img
                  src={a.src}
                  alt=""
                  className={`block h-16 max-w-40 border border-ink/15 bg-cream-deep object-cover ${a.id ? "" : "opacity-50"}`}
                />
                <button
                  type="button"
                  title="Remove image"
                  aria-label="Remove image"
                  onClick={() =>
                    setImages((prev) => prev.filter((b) => b.key !== a.key))
                  }
                  className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-ink text-[13px] leading-none text-cream hover:bg-ink-muted"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {imageError && (
          <p className="px-3.5 pb-1 text-[13px] text-ink-muted">{imageError}</p>
        )}
        <div className="flex items-center gap-0.5 px-2 pb-2">
          <Toolbar editor={editor} onFiles={(files) => void addFiles(files)} />
          <span className="flex-1" />
          {wordCount && (
            <span
              aria-live="polite"
              className="pr-2 text-[13px] text-ink-muted tabular-nums"
            >
              {words} {words === 1 ? "word" : "words"}
            </span>
          )}
          <span
            className="hidden pr-2 text-[13px] text-ink-muted @xl:inline"
          >
            {onCancel ? "Esc to cancel · " : ""}Shift+Enter for a new line
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer px-3 py-1.5 text-[15px] text-ink-muted underline @xl:hidden"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={(isEmpty && images.length === 0) || uploading}
            className="shrink-0 cursor-pointer bg-ink px-4 py-1.5 text-[15px] text-cream transition-[background-color,opacity] enabled:hover:bg-ink-muted disabled:cursor-default disabled:opacity-35"
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
            left: Math.max(
              8,
              Math.min(mention.rect.left, window.innerWidth - 256 - 8),
            ),
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

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function imageFiles(data: { files: FileList | null } | null): File[] {
  return [...(data?.files ?? [])].filter(
    (f) => f.type.startsWith("image/") && !f.type.includes("svg"),
  );
}

function imageSize(src: string): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({});
    img.src = src;
  });
}

// Messages keep their images as top-level "image" nodes after the text; the
// editor itself only holds the text, so split them apart and join them back.
function splitImages(doc: JSONContent | undefined): {
  doc: JSONContent | undefined;
  images: Attachment[];
} {
  if (!doc?.content) return { doc, images: [] };
  const images: Attachment[] = [];
  const content: JSONContent[] = [];
  for (const n of doc.content) {
    if (n.type !== "image") content.push(n);
    else if (
      typeof n.attrs?.id === "string" &&
      typeof n.attrs?.src === "string"
    )
      images.push({
        key: crypto.randomUUID(),
        id: n.attrs.id,
        src: n.attrs.src,
        width: n.attrs.width ?? undefined,
        height: n.attrs.height ?? undefined,
      });
  }
  return { doc: { ...doc, content }, images };
}

function withImages(doc: JSONContent, images: Attachment[]): JSONContent {
  const uploaded = images.filter((a) => a.id);
  if (!uploaded.length) return doc;
  return {
    ...doc,
    content: [
      ...(doc.content ?? []),
      ...uploaded.map((a) => ({
        type: "image",
        attrs: { id: a.id, src: a.src, width: a.width, height: a.height },
      })),
    ],
  };
}

function readDraft(key: string): JSONContent | undefined {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as JSONContent) : undefined;
  } catch {
    return undefined;
  }
}

function writeDraft(key: string, editor: Editor, images: Attachment[]) {
  try {
    if (editor.isEmpty && !images.some((a) => a.id))
      localStorage.removeItem(key);
    else
      localStorage.setItem(
        key,
        JSON.stringify(withImages(editor.getJSON(), images)),
      );
  } catch {
    // Storage can be full or blocked; the draft just isn't kept.
  }
}

// Phones and tablets: Enter should add a new line, not send. Some phones (Samsung
// ones with a stylus, for example) claim to support hover, so also check the user
// agent. iPads report themselves as Macs, but Macs have no touch points.
function isTouchScreen() {
  const ua = navigator.userAgent;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

// Shift+Enter adds line breaks inside one paragraph, so a list or quote would wrap
// every line typed so far. Before adding one, split the cursor's line (or the
// selected lines) into its own paragraph so only that part changes.
function isolateLine({ tr }: { tr: Transaction }) {
  const { $from, $to } = tr.selection;
  if ($from.parent !== $to.parent || $from.parent.type.name !== "paragraph")
    return true;
  const start = $from.start();
  let before = -1;
  let after = -1;
  $from.parent.forEach((child, offset) => {
    if (child.type.name !== "hardBreak") return;
    const pos = start + offset;
    if (pos < $from.pos) before = pos;
    else if (pos >= $to.pos && after === -1) after = pos;
  });
  // Later break first, so the earlier position stays valid.
  for (const pos of [after, before]) {
    if (pos < 0) continue;
    tr.delete(pos, pos + 1);
    tr.split(pos);
  }
  return true;
}

function Toolbar({
  editor,
  onFiles,
}: {
  editor: Editor | null;
  onFiles: (files: File[]) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
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
      <button
        type="button"
        title="Add image (or paste one)"
        className={btn(false)}
        onClick={() => picker.current?.click()}
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
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m21 16-5-5-9 9" />
        </svg>
      </button>
      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = imageFiles(e.target);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <span className="hidden items-center gap-0.5 @sm:flex">
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
          onClick={() =>
            editor
              .chain()
              .focus()
              .command(state.bullet ? () => true : isolateLine)
              .toggleBulletList()
              .run()
          }
        >
          ••
        </button>
        <button
          type="button"
          title="Quote"
          aria-pressed={state.quote}
          className={`${btn(state.quote)} font-display text-[20px]`}
          onClick={() =>
            editor
              .chain()
              .focus()
              .command(state.quote ? () => true : isolateLine)
              .toggleBlockquote()
              .run()
          }
        >
          “
        </button>
      </span>
    </div>
  );
}
