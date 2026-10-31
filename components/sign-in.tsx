"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const input =
  "min-h-[46px] w-full rounded-none border border-ink/28 bg-cream px-3.5 py-3 font-body text-[19px] text-inherit";

// Google sign-in plus an emailed magic link, returning to `next` afterward.
export function SignInPanel({
  next,
  tone = "light",
}: {
  next: string;
  tone?: "light" | "deep";
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);
  // Absolute, because Better Auth rejects relative paths with a #fragment.
  const callbackURL = () => new URL(next, window.location.origin).href;

  async function google() {
    setGooglePending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackURL(),
    });
    if (error) {
      setGooglePending(false);
      setError(
        error.message ??
          "Google sign-in isn’t available right now. Try an email link instead.",
      );
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: callbackURL(),
    });
    if (error) {
      setState("error");
      setError(error.message ?? "Couldn’t send that link. Please try again.");
    } else setState("sent");
  }

  return (
    <div
      className={`flex flex-col gap-5 ${tone === "deep" ? "bg-cream-deep p-[clamp(20px,3vw,36px)]" : ""}`}
    >
      <button
        type="button"
        onClick={google}
        disabled={googlePending}
        className="flex min-h-[52px] cursor-pointer items-center justify-center gap-3 rounded-none border border-ink bg-cream px-6 text-[18px] transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-60"
      >
        <GoogleIcon />
        {googlePending ? "Opening Google…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-[13px] tracking-[0.12em] text-ink-muted uppercase">
        <span className="h-px flex-1 bg-ink/20" /> or{" "}
        <span className="h-px flex-1 bg-ink/20" />
      </div>

      {state === "sent" ? (
        <p role="status" className="text-[18px] leading-[1.5] text-pretty">
          Check <strong>{email}</strong> for a sign-in link. It expires in 15
          minutes.{" "}
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => setState("idle")}
          >
            Use a different email
          </button>
        </p>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <label
            htmlFor="signin-email"
            className="text-[13px] tracking-[0.12em] text-ink-muted uppercase"
          >
            Email me a sign-in link
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              placeholder="kit@justwrite.club"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${input} min-w-0 flex-1 basis-56`}
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="min-h-[46px] cursor-pointer rounded-none bg-ink px-6 text-[18px] text-cream transition-colors hover:bg-ink-muted disabled:cursor-wait disabled:opacity-70"
            >
              {state === "sending" ? "Sending…" : "Send link"}
            </button>
          </div>
          <p className="text-[15px] text-ink-muted">
            Use the email you signed up with.
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="text-base text-brass-text">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
