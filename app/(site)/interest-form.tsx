"use client";

import { useActionState, useSyncExternalStore } from "react";
import { SIGNUPS_CLOSE } from "@/convex/lib/program";
import { submitInterest, type InterestState } from "./actions";

const input =
  "min-h-[42px] w-full rounded-none border border-ink/28 bg-cream px-3 py-2 font-body text-[17px] text-inherit";
const fieldLabel = "text-[12px] tracking-[0.12em] uppercase text-ink-muted";

const noop = () => () => {};

export function InterestForm() {
  // Read on the client: the landing page is prerendered, so the build time would be stale.
  const closed = useSyncExternalStore(
    noop,
    () => Date.now() >= SIGNUPS_CLOSE,
    () => false,
  );
  if (closed) {
    return (
      <div className="flex flex-col gap-1 bg-cream-deep p-[clamp(16px,min(2vw,2.6vh),24px)]">
        <p className="font-display text-[clamp(21px,3.1vh,24px)] font-[450]">
          Sign-ups are closed.
        </p>
        <p className="text-[17px] text-ink-muted">
          Sign-ups for Nov 2026 closed on Nov 4. Members can{" "}
          <a href="/home">sign in</a>.
        </p>
      </div>
    );
  }
  return <OpenForm />;
}

function OpenForm() {
  const [state, action, pending] = useActionState<InterestState, FormData>(
    submitInterest,
    { status: "idle" },
  );

  return (
    <form
      id="interest"
      action={action}
      aria-label="Express interest"
      className="flex scroll-mt-6 flex-col gap-3 bg-cream-deep p-[clamp(16px,min(2vw,2.6vh),24px)]"
    >
      <>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="jw-name" className={fieldLabel}>
              Name
            </label>
            <input
              id="jw-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Kit When"
              className={input}
            />
          </div>
          <div className="flex flex-col gap-1">
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
          <div className="col-span-full flex flex-wrap gap-x-5 gap-y-3">
            <div className="flex min-w-[min(240px,100%)] flex-1 flex-col gap-1">
              <label htmlFor="jw-website" className={fieldLabel}>
                Website
              </label>
              <input
                id="jw-website"
                name="website"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder="kitwhen.com or x.com/kitwhen"
                className={input}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="flex min-h-[42px] cursor-pointer flex-none items-center justify-center gap-2.5 self-end whitespace-nowrap rounded-none bg-ink px-5 font-body text-[17px] tracking-[0.02em] text-cream disabled:cursor-wait disabled:opacity-70"
            >
              {pending ? "Sending…" : "Express interest"}
              <svg
                aria-hidden="true"
                width="18"
                height="12"
                viewBox="0 0 18 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M0 6h16M11 1l5 5-5 5" />
              </svg>
            </button>
          </div>
        </div>
        {state.status === "error" && (
          <p role="alert" className="text-[15px] text-ink">
            {state.message}
          </p>
        )}
      </>
    </form>
  );
}
