"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Avatar } from "@/components/portal/avatar";
import { usePortal } from "@/components/portal/context";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/convex";

const input =
  "min-h-[46px] w-full rounded-none border border-ink/28 bg-cream px-3.5 py-2.5 font-body text-[18px] text-inherit";
const label = "text-[13px] tracking-[0.12em] text-ink-muted uppercase";

// Center-crops to a square and scales down, so uploads stay small.
async function resizeImage(file: File, size = 400): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out,
    );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn’t read that image."))),
      "image/jpeg",
      0.88,
    ),
  );
}

function PhotoPicker() {
  const { me } = usePortal();
  const getUploadUrl = useMutation(api.members.avatarUploadUrl);
  const setAvatar = useMutation(api.members.setAvatar);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const blob = await resizeImage(file);
      const res = await fetch(await getUploadUrl(), {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = await res.json();
      await setAvatar({ storageId });
    } catch (err) {
      setError(
        err instanceof DOMException
          ? "Couldn’t read that image."
          : errorMessage(err),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Change photo"
        className={`cursor-pointer rounded-full transition-opacity hover:opacity-85 ${uploading ? "opacity-50" : ""}`}
      >
        <Avatar member={me} size={72} />
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
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
          if (file) upload(file);
        }}
      />
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
