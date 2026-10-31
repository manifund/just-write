"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { usePortal } from "@/components/portal/context";
import { timeAgo, useNow } from "@/components/portal/util";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/convex";

const h2 = "font-display text-[clamp(26px,3vw,32px)] leading-[1.1] font-[380] tracking-[-0.015em]";
const input =
  "w-full rounded-none border border-ink/28 bg-cream px-3.5 py-2.5 font-body text-[18px] text-inherit";

export function Ideas() {
  return (
    <main className="mx-auto flex max-w-[76rem] flex-col gap-[clamp(28px,5vh,48px)] px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[clamp(38px,5.2vw,64px)] leading-none font-[340] tracking-[-0.025em]">
          Essay <em className="wonk text-brass-numeral">ideas</em>
        </h1>
        <p className="max-w-[36em] text-[clamp(17px,2.2vw,20px)] leading-[1.45] text-pretty text-ink-muted">
          Keep a list of essay ideas. Shared ideas are visible to other members, who can mark the ones they’d read.
        </p>
      </header>
      <div className="grid gap-[clamp(32px,5vh,48px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Notebook />
        <Board />
      </div>
    </main>
  );
}

function IdeaForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial?: { title: string; notes: string; shared: boolean };
  onSave: (v: { title: string; notes: string; shared: boolean }) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [shared, setShared] = useState(initial?.shared ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3 bg-cream-deep p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSave({ title, notes, shared });
          if (!initial) {
            setTitle("");
            setNotes("");
          }
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <input
        aria-label="Idea title"
        required
        placeholder="A working title, a question, a hook…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={`${input} font-display text-[20px]`}
      />
      <textarea
        aria-label="Notes"
        rows={3}
        placeholder="Notes (optional): the angle, why it matters, what you’d need to find out"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={`${input} resize-y text-[16px] leading-[1.45]`}
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-[16px]">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="size-4 accent-ink" />
          Share with members
        </label>
        <span className="ml-auto flex gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className="cursor-pointer px-2 text-[16px] text-ink-muted underline">
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="cursor-pointer bg-ink px-5 py-2 text-[16px] text-cream transition-colors enabled:hover:bg-ink-muted disabled:opacity-45"
          >
            {saving ? "Saving…" : submitLabel}
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="text-[15px] text-brass-text">
          {error}
        </p>
      )}
    </form>
  );
}

function Notebook() {
  const ideas = useQuery(api.ideas.mine);
  const create = useMutation(api.ideas.create);
  const update = useMutation(api.ideas.update);
  const remove = useMutation(api.ideas.remove);
  const [editing, setEditing] = useState<Id<"ideas"> | null>(null);

  return (
    <section aria-labelledby="notebook" className="flex flex-col gap-4">
      <h2 id="notebook" className={h2}>
        Your ideas
      </h2>
      <IdeaForm submitLabel="Add idea" onSave={async (v) => void (await create(v))} />
      <ul className="flex flex-col divide-y divide-ink/10">
        {ideas?.map((i) =>
          editing === i._id ? (
            <li key={i._id} className="py-3">
              <IdeaForm
                submitLabel="Save"
                initial={{ title: i.title, notes: i.notes ?? "", shared: i.shared }}
                onCancel={() => setEditing(null)}
                onSave={async (v) => {
                  await update({ ideaId: i._id, ...v });
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={i._id} className="group flex flex-col gap-1 py-3">
              <div className="flex items-baseline gap-3">
                <p className="font-display text-[19px] leading-[1.25] font-[450] text-pretty">{i.title}</p>
                <span className="ml-auto shrink-0 text-[13px] tracking-[0.08em] text-ink-muted uppercase">
                  {i.shared ? `Shared${i.votes ? ` · ${i.votes} ★` : ""}` : "Private"}
                </span>
              </div>
              {i.notes && <p className="text-[15px] leading-[1.45] whitespace-pre-line text-ink-muted">{i.notes}</p>}
              <div className="flex gap-4 text-[14px] text-ink-muted">
                <button type="button" className="cursor-pointer underline" onClick={() => setEditing(i._id)}>
                  Edit
                </button>
                <button type="button" className="cursor-pointer underline" onClick={() => update({ ideaId: i._id, title: i.title, notes: i.notes ?? "", shared: !i.shared })}>
                  {i.shared ? "Make private" : "Share"}
                </button>
                <button type="button" className="cursor-pointer underline" onClick={() => remove({ ideaId: i._id })}>
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {ideas?.length === 0 && <p className="text-[16px] text-ink-muted">No ideas yet.</p>}
    </section>
  );
}

function Board() {
  const ideas = useQuery(api.ideas.board);
  const vote = useMutation(api.ideas.toggleVote);
  const { me } = usePortal();
  const now = useNow();

  return (
    <section aria-labelledby="board" className="flex flex-col gap-4">
      <h2 id="board" className={h2}>
        Shared ideas
      </h2>
      {ideas?.length === 0 && <p className="text-[16px] text-ink-muted">Ideas that members share show up here.</p>}
      <ul className="columns-1 gap-4 sm:columns-2">
        {ideas?.map((i) => {
          const self = i.memberId === me._id;
          return (
            <li key={i._id} className="mb-4 flex break-inside-avoid flex-col gap-2.5 border border-ink/12 bg-cream p-4 motion-safe:animate-[rise_220ms_ease-out]">
              <p className="font-display text-[20px] leading-[1.2] font-[450] text-pretty">{i.title}</p>
              {i.notes && <p className="line-clamp-6 text-[15px] leading-[1.45] whitespace-pre-line text-ink-muted">{i.notes}</p>}
              <div className="mt-1 flex items-center gap-2">
                <Link href={i.author.handle ? `/members/${i.author.handle}` : "/members"} className="flex min-w-0 items-center gap-2 text-[14px] no-underline hover:underline">
                  <Avatar member={i.author} size={22} />
                  <span className="truncate">{i.author.name}</span>
                </Link>
                {now && <span className="text-[13px] text-ink-muted">· {timeAgo(i.updatedAt, now)}</span>}
                <button
                  type="button"
                  disabled={self}
                  aria-pressed={i.voted}
                  onClick={() => vote({ ideaId: i._id })}
                  title={self ? "Votes from others show here" : i.voted ? "You’d read this" : "I’d read this"}
                  className={`ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[14px] tabular-nums transition-colors disabled:cursor-default ${
                    i.voted ? "border-brass bg-brass/15 text-brass-text" : "border-ink/20 enabled:hover:border-ink/50"
                  }`}
                >
                  <span aria-hidden="true">{i.voted ? "★" : "☆"}</span>
                  {self ? i.votes : i.voted ? `I’d read this · ${i.votes}` : `I’d read this${i.votes ? ` · ${i.votes}` : ""}`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
