"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { api } from "@/convex/_generated/api";
import type { ZineOrderView } from "@/convex/zineOrders";
import { BINDINGS, INKS, SHIPPING, dollars, type ShippingLevel } from "@/lib/zine/print";
import { retryOrder } from "../actions";

// What a member reads for each step. Lulu's own statuses: developers.lulu.com/docs.
function statusText(o: ZineOrderView) {
  if (o.status === "paid" || o.status === "rendering") return "Preparing the print files";
  if (o.status === "shipped") return "Shipped";
  if (o.status === "failed") return "Something went wrong. We’ll sort it out and email you.";
  if (o.status === "printing") {
    const s = o.luluStatus ?? "";
    if (s === "IN_PRODUCTION" || s === "PRODUCTION_READY") return "Printing";
    if (s === "PRODUCTION_DELAYED") return "Printing (delayed at the printer)";
    return "Sent to the printer";
  }
  return o.status;
}

export function Orders() {
  return (
    <Suspense fallback={null}>
      <OrderList />
    </Suspense>
  );
}

function OrderList() {
  const orders = useQuery(api.zineOrders.list);
  const all = useQuery(api.zineOrders.all);
  const placed = useSearchParams().get("placed");
  return (
    <main className="mx-auto w-full max-w-[760px] px-[clamp(20px,4vw,56px)] py-10">
      <Link href="/zine" className="text-[14px] text-ink-muted underline">
        ← Zine
      </Link>
      <h1 className="mt-3 font-display text-[40px] leading-tight font-[340]">Your orders</h1>
      {placed && (
        <p className="mt-4 border border-ink/15 bg-paper px-4 py-3">
          Thanks! Your order is paid. We’re preparing the print files now; Lulu usually prints in
          3–5 business days, then ships. Tracking shows up here.
        </p>
      )}
      {orders === undefined ? null : orders.length === 0 ? (
        <p className="mt-6 text-ink-muted">
          No orders yet. <Link href="/zine?order=1" className="underline">Order a printed copy</Link>.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((o) => (
            <OrderRow key={o._id} o={o} />
          ))}
        </ul>
      )}
      {all && all.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">Everyone’s orders (admins)</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {all.map((o) => (
              <OrderRow key={o._id} o={o} who={o.member} admin luluJobId={o.luluJobId} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function OrderRow({
  o,
  who,
  admin,
  luluJobId,
}: {
  o: ZineOrderView;
  who?: string;
  admin?: boolean;
  luluJobId?: number;
}) {
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const ink = INKS[o.print.ink as keyof typeof INKS]?.label ?? o.print.ink;
  const binding = BINDINGS[o.print.binding as keyof typeof BINDINGS]?.label ?? o.print.binding;
  return (
    <li className="border border-ink/15 bg-paper px-4 py-3 text-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-[18px]">
          Issue {o.week}
          {who ? ` · ${who}` : ""}
        </span>
        <span className="tabular-nums">{dollars(o.totalCents)}</span>
      </div>
      <p className="mt-1 text-ink-muted">
        {o.quantity} {o.quantity === 1 ? "copy" : "copies"} · {o.pages} pages · {binding}, {ink.toLowerCase()} ·{" "}
        {SHIPPING[o.shippingLevel as ShippingLevel]?.label ?? o.shippingLevel} to {o.address.city}
        {o.paidAt ? ` · ordered ${new Date(o.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
      </p>
      <p className="mt-2">{statusText(o)}</p>
      {o.tracking.map((t, i) => (
        <p key={i} className="mt-1">
          {t.url ? (
            <a href={t.url} target="_blank" rel="noreferrer" className="underline">
              Track{t.carrier ? ` with ${t.carrier}` : ""}
            </a>
          ) : (
            `Tracking: ${t.carrier ?? ""} ${t.number ?? ""}`
          )}
        </p>
      ))}
      {admin && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
          <span>
            {o.status}
            {o.luluStatus ? ` · Lulu ${o.luluStatus}` : ""}
            {luluJobId ? ` · job ${luluJobId}` : ""}
          </span>
          {o.error && <span className="text-brass-text">{o.error}</span>}
          {o.status === "failed" && o.paidAt && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await retryOrder(o._id);
                  setNote(r.error ?? "Started again.");
                })
              }
              className="cursor-pointer underline disabled:opacity-50"
            >
              {busy ? "Retrying…" : "Retry"}
            </button>
          )}
          {note && <span>{note}</span>}
        </div>
      )}
    </li>
  );
}
