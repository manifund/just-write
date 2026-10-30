"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { startCommitment, type CommitState } from "./actions";

const input =
  "min-h-[46px] w-full rounded-none border border-ink/28 bg-cream px-3.5 py-3 font-body text-[19px] text-inherit";
const fieldLabel = "text-[13px] tracking-[0.12em] uppercase text-ink-muted";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });
const noop = () => () => {};

export function CommitForm() {
  const [state, action, pending] = useActionState<CommitState, FormData>(startCommitment, { status: "idle" });
  // Read on the client so the date is the signer's today, not the build date.
  const today = useSyncExternalStore(noop, () => dateFmt.format(new Date()), () => null);
  const canceled = useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).has("canceled"),
    () => false,
  );
  // The button stays disabled until the box is checked, the email is valid, and the signature is filled in.
  const [ready, setReady] = useState(false);

  return (
    <form
      id="sign"
      action={action}
      aria-label="Sign and commit"
      onInput={(e) => setReady(e.currentTarget.checkValidity())}
      onChange={(e) => setReady(e.currentTarget.checkValidity())}
      onReset={() => setReady(false)}
      className="flex scroll-mt-6 flex-col gap-[clamp(18px,2.6vh,26px)] bg-cream-deep p-[clamp(20px,min(3vw,4vh),40px)]"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[clamp(30px,4.2vh,36px)] leading-[1.05] font-[340] tracking-[-0.015em]">
          Sign &amp; commit
        </h2>
        {canceled && state.status === "idle" && (
          <p role="status" className="text-base text-ink-muted">
            Checkout was canceled, so nothing was charged. You can try again below.
          </p>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-[17px] leading-[1.45] text-pretty">
        <input type="checkbox" name="agree" required className="mt-[3px] size-5 shrink-0 cursor-pointer accent-ink" />
        <span>I’ve read and agree to the terms above.</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="jw-email" className={fieldLabel}>
          Email
        </label>
        <input
          id="jw-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="kit@justwrite.club"
          className={input}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-6 gap-y-1.5">
        <label htmlFor="jw-signature" className={fieldLabel}>
          Signature
        </label>
        <span className={`${fieldLabel} text-right`}>Date</span>
        <input
          id="jw-signature"
          name="signature"
          type="text"
          autoComplete="name"
          required
          placeholder="Type your full name"
          className="min-h-[52px] w-full rounded-none border-0 border-b border-ink bg-transparent px-0.5 pb-1 font-display text-[clamp(26px,4vh,32px)] italic text-inherit [font-variation-settings:'SOFT'_100,'WONK'_1] placeholder:font-body placeholder:text-[19px] placeholder:not-italic focus-visible:outline-offset-2"
        />
        <span className="min-h-[52px] border-b border-ink pb-2 text-right text-[19px] whitespace-nowrap tabular-nums content-end">
          {today ?? " "}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5">
        <button
          type="submit"
          disabled={pending || !ready}
          className="group flex min-h-[50px] cursor-pointer items-center gap-3 rounded-none bg-ink px-[26px] font-body text-[19px] tracking-[0.02em] text-cream transition-[background-color,opacity] duration-150 enabled:hover:bg-ink-muted enabled:active:bg-ink disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-wait aria-busy:opacity-70"
          aria-busy={pending}
        >
          {pending ? "Opening checkout…" : "Sign & pay $1,000"}
          <svg
            aria-hidden="true"
            width="18"
            height="12"
            viewBox="0 0 18 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="transition-transform duration-150 motion-safe:group-enabled:group-hover:translate-x-1"
          >
            <path d="M0 6h16M11 1l5 5-5 5" />
          </svg>
        </button>
        <span className="text-[15px] text-ink-muted">Secure checkout by Stripe</span>
      </div>
      {state.status === "error" && (
        <p role="alert" className="-mt-2 text-base text-ink">
          {state.message}
        </p>
      )}
    </form>
  );
}
