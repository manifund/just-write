import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { stripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "You’re in · Just Write",
  robots: { index: false, follow: false },
};

// The webhook is what marks someone committed; this page only reports what Stripe says.
async function Status({
  searchParams,
}: {
  searchParams: PageProps<"/commit/thanks">["searchParams"];
}) {
  const { session_id } = await searchParams;
  let paid = false;
  let processing = false;
  if (typeof session_id === "string" && session_id.startsWith("cs_")) {
    try {
      const session = await stripe().checkout.sessions.retrieve(session_id);
      paid = session.payment_status !== "unpaid";
      processing = session.status === "complete" && !paid;
    } catch (err) {
      console.error("thanks: retrieve session failed", err);
    }
  }

  if (paid) {
    return (
      <>
        <h1 className="font-display text-[clamp(40px,6vw,64px)] leading-none font-[340] tracking-[-0.025em]">
          You’re <em className="wonk text-brass-light">in</em>.
        </h1>
        <p className="text-[clamp(18px,2.6vh,20px)] leading-[1.45] text-pretty text-wash-light">
          We got your deposit and Stripe has emailed you a receipt. Come say hi
          in the member portal.
        </p>
        <Link
          href="/home"
          className="self-start bg-cream px-6 py-3 text-[18px] text-ink no-underline"
        >
          Open the member portal →
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-[clamp(40px,6vw,64px)] leading-none font-[340] tracking-[-0.025em]">
        Almost there.
      </h1>
      <p className="text-[clamp(18px,2.6vh,20px)] leading-[1.45] text-pretty text-wash-light">
        {processing
          ? "Your payment is still processing. We’ll mark you as committed once it clears."
          : "We couldn’t confirm your payment yet. If you were charged, you’re all set; otherwise, try again."}
      </p>
    </>
  );
}

export default function ThanksPage({
  searchParams,
}: PageProps<"/commit/thanks">) {
  return (
    <main className="flex min-h-dvh flex-col bg-ink px-[clamp(24px,5vw,72px)] py-[clamp(28px,4.5vh,56px)] text-cream">
      <div className="mx-auto flex w-full max-w-[44rem] flex-1 flex-col gap-[clamp(28px,6vh,56px)]">
        <Link
          href="/"
          className="font-display text-[25px] font-medium tracking-[-0.01em] no-underline"
        >
          Just <span className="text-brass-light">Write</span>
        </Link>
        <div className="flex flex-col gap-4">
          <Suspense
            fallback={<p className="text-wash-light">Checking your payment…</p>}
          >
            <Status searchParams={searchParams} />
          </Suspense>
        </div>
        <Link href="/" className="mt-auto text-[17px] text-wash-light">
          Back to Just Write
        </Link>
      </div>
    </main>
  );
}
