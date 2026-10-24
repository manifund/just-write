"use client";

import { useActionState } from "react";
import { submitInterest, type InterestState } from "./actions";

const input =
  "min-h-[46px] w-full rounded-none border border-ink/28 bg-cream px-3.5 py-3 font-body text-[19px] text-inherit";
const fieldLabel = "text-[13px] tracking-[0.12em] uppercase text-ink-muted";

export function InterestForm() {
  const [state, action, pending] = useActionState<InterestState, FormData>(
    submitInterest,
    { status: "idle" },
  );

  return (
    <form
      id="interest"
      action={action}
      aria-label="Express interest"
      className="flex scroll-mt-6 flex-col gap-[clamp(14px,2.2vh,22px)] bg-cream-deep p-[clamp(20px,min(2.4vw,3.4vh),32px)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5">
        <h2 className="font-display text-[clamp(30px,4.2vh,36px)] leading-[1.05] font-[340] tracking-[-0.015em]">
          Express interest
        </h2>
      </div>

      {state.status === "ok" ? (
        <p role="status" className="text-[19px] leading-[1.45]">
          Thanks, {state.name}. We’ll be in touch soon.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-x-6 gap-y-3.5">
            <div className="flex flex-col gap-1.5">
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5">
            <button
              type="submit"
              disabled={pending}
              className="flex min-h-[50px] cursor-pointer items-center gap-3 rounded-none bg-ink px-[26px] font-body text-[19px] tracking-[0.02em] text-cream disabled:cursor-wait disabled:opacity-70"
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
          {state.status === "error" && (
            <p role="alert" className="-mt-2 text-base text-ink">
              {state.message}
            </p>
          )}
        </>
      )}
    </form>
  );
}
