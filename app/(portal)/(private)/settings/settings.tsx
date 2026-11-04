"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { usePortal } from "@/components/portal/context";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/convex";
import { PhotoCrop } from "./crop";

const input =
  "min-h-[46px] w-full rounded-none border border-ink/28 bg-cream px-3.5 py-2.5 font-body text-[18px] text-inherit";
const label = "text-[13px] tracking-[0.12em] text-ink-muted uppercase";

function PhotoPicker() {
  const { me } = usePortal();
  const getUploadUrl = useMutation(api.members.avatarUploadUrl);
  const setAvatar = useMutation(api.members.setAvatar);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Blob | string | null>(null);
  const [pickCount, setPickCount] = useState(0); // remounts the crop step per photo

  async function upload(blob: Blob) {
    setPicked(null);
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(await getUploadUrl(), {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = await res.json();
      await setAvatar({ storageId });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  // With a current photo, open the crop step on it; otherwise pick a file.
  function change() {
    setError(null);
    if (me?.image) setPicked(me.image);
    else inputRef.current?.click();
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={change}
        disabled={uploading}
        aria-label="Change photo"
        className={`cursor-pointer rounded-full transition-opacity hover:opacity-85 ${uploading ? "opacity-50" : ""}`}
      >
        <Avatar member={me} size={72} />
      </button>
      <button
        type="button"
        onClick={change}
        disabled={uploading}
        className="cursor-pointer text-[13px] text-ink-muted underline-offset-2 hover:underline"
      >
        {uploading ? "Uploading…" : "Change photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            setError(null);
            setPicked(file);
            setPickCount((n) => n + 1);
          }
        }}
      />
      {picked && (
        <PhotoCrop
          key={pickCount}
          file={picked}
          onCancel={() => setPicked(null)}
          onSave={upload}
          onChooseFile={() => inputRef.current?.click()}
        />
      )}
      {error && (
        <p
          role="alert"
          className="max-w-[10rem] text-center text-[13px] text-brass-text"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function Reminders() {
  const prefs = useQuery(api.members.emailPrefs);
  const setReminders = useMutation(
    api.members.setCheckInReminders,
  ).withOptimisticUpdate((store, { on }) =>
    store.setQuery(api.members.emailPrefs, {}, { checkInReminders: on }),
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3 border-t border-ink/15 pt-6">
      <h2 className={label}>Email</h2>
      <label className="flex cursor-pointer items-start gap-3 text-[18px]">
        <input
          type="checkbox"
          checked={prefs?.checkInReminders ?? false}
          disabled={!prefs}
          onChange={async (e) => {
            setError(null);
            try {
              await setReminders({ on: e.target.checked });
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
          className="mt-1.5 size-4 shrink-0 accent-ink"
        />
        <span className="flex flex-col gap-0.5">
          <span>Remind me to post a check-in</span>
          <span className="text-[14px] text-ink-muted">
            A short email at 6pm Pacific on days you haven’t posted in
            #check-ins yet.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="text-[16px] text-brass-text">
          {error}
        </p>
      )}
    </section>
  );
}

export function Settings() {
  const { me } = usePortal();
  const save = useMutation(api.members.updateProfile);
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle ?? "");
  const [link, setLink] = useState(me.link ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-8 px-[clamp(20px,4vw,56px)] py-[clamp(24px,5vh,56px)]">
      <header className="flex items-center gap-5">
        <PhotoPicker />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[clamp(34px,4.5vw,52px)] leading-none font-[340] tracking-[-0.025em]">
            Your <em className="wonk text-brass-numeral">profile</em>
          </h1>
          {me.handle && (
            <Link
              href={`/members/${me.handle}`}
              className="text-[16px] text-ink-muted"
            >
              justwrite.club/members/{me.handle}
            </Link>
          )}
        </div>
      </header>

      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("saving");
          setError(null);
          try {
            await save({ name, handle, link, bio });
            setState("saved");
          } catch (err) {
            setError(errorMessage(err));
            setState("idle");
          }
        }}
        onChange={() => state === "saved" && setState("idle")}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Handle</span>
            <input
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              autoCapitalize="none"
              spellCheck={false}
              className={input}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Website</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="kitwhen.com or x.com/kitwhen"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={600}
            placeholder="What do you do, and what do you want to write about this month?"
            className={`${input} resize-y leading-[1.45]`}
          />
          <span className="text-[14px] text-ink-muted">
            Shown on your public profile.
          </span>
        </label>
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={state === "saving"}
            className="min-h-[48px] cursor-pointer bg-ink px-7 text-[18px] text-cream transition-colors hover:bg-ink-muted disabled:opacity-60"
          >
            {state === "saving" ? "Saving…" : "Save profile"}
          </button>
          {state === "saved" && (
            <span
              role="status"
              className="text-[16px] text-ink-muted motion-safe:animate-[rise_220ms_ease-out]"
            >
              Saved ✓
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="text-[16px] text-brass-text">
            {error}
          </p>
        )}
      </form>

      <Reminders />

      <div className="border-t border-ink/15 pt-6">
        <button
          type="button"
          onClick={() =>
            authClient.signOut().then(() => window.location.assign("/"))
          }
          className="min-h-[44px] cursor-pointer border border-ink/28 px-5 text-[16px] transition-colors hover:bg-ink/5"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
