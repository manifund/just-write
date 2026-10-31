import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "./sign-in";

export const metadata: Metadata = {
  title: "Sign in · Just Write",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh grid-cols-[repeat(auto-fit,minmax(min(480px,100%),1fr))]">
      <section className="flex flex-col gap-8 bg-ink px-[clamp(24px,4vw,56px)] py-[clamp(28px,4.5vh,56px)] text-cream">
        <Link
          href="/"
          className="font-display text-[25px] font-medium tracking-[-0.01em] no-underline"
        >
          Just <span className="text-brass-light">Write</span>
        </Link>
        <div className="my-auto flex flex-col gap-4">
          <h1 className="max-w-[8em] font-display text-[clamp(44px,6vw,72px)] leading-none font-[340] tracking-[-0.025em] text-balance">
            Member <em className="wonk text-brass-light">portal</em>
          </h1>
          <p className="max-w-[26em] text-[19px] leading-[1.45] text-pretty text-wash-light">
            Chat with other writers, share essay ideas, and register your
            essays.
          </p>
        </div>
      </section>
      <section className="flex flex-col justify-center px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)]">
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-6">
          <h2 className="font-display text-[36px] leading-[1.05] font-[340] tracking-[-0.015em]">
            Sign in
          </h2>
          <SignIn />
          <p className="text-[15px] text-ink-muted">
            Not a member yet? <Link href="/commit">Commit to Just Write</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
