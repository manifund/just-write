"use server";

// /zine's Order panel: prices from Lulu (or rough estimates until Lulu keys are set), then
// a free order within the weekly cap, or Stripe Checkout once members pay. Prices are always worked out here, never taken from the browser.
import { fetchMutation } from "convex/nextjs";
import { headers } from "next/headers";
import { after } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthMutation, fetchAuthQuery, serverSecret } from "@/lib/auth-server";
import { errorMessage } from "@/lib/convex";
import { LuluError, luluConfigured, quote, shippingOptions } from "@/lib/lulu";
import { stripe } from "@/lib/stripe";
import { startPrint, submit } from "@/lib/zine/fulfill";
import {
  CHARGE_MEMBERS,
  FULFILLMENT_CENTS,
  SHIPPING,
  addressProblem,
  estimatePrintCents,
  interiorPages,
  pagesProblem,
  podPackageId,
  readAddress,
  readPrintOptions,
  withFees,
  type Address,
  type PrintOptions,
  type ShippingLevel,
} from "@/lib/zine/print";
import { readTweaks, type Tweaks } from "@/lib/zine/tweaks";

export type ShippingQuote = {
  level: ShippingLevel;
  days: [number, number];
  luluCents: number;
  feeCents: number;
  totalCents: number;
};

export type Quote =
  | {
      ok: true;
      pages: number;
      estimate: boolean; // rough numbers: Lulu keys aren't set
      printCents: number; // all copies, before shipping
      shipping: ShippingQuote[]; // empty until there's an address to quote
      open: boolean; // whether checkout works yet
      charge: boolean; // false: Just Write covers the order (lib/zine/print.ts#CHARGE_MEMBERS)
      leftCents: number | null; // what's left of the member's weekly allowance, if known
    }
  | { ok: false; error: string };

export type QuoteInput = {
  week: number;
  tweaks: unknown;
  previewPages: number;
  print: unknown;
  address: unknown; // null for a print-only price
};

// The signed-in member, through members.viewer (so this works on previews, whose Convex
// functions may be older than this code).
async function member() {
  const viewer = await fetchAuthQuery(api.members.viewer, {});
  if (!viewer?.member || !viewer.canEnter) throw new Error("Only committed members can order.");
  return viewer.member;
}

const ordersOpen = () => process.env.ZINE_ORDERS === "on" && luluConfigured();

// Where we price before there's an address: Lulu needs one, so a US one stands in.
const PLACEHOLDER: Address = {
  name: "",
  street1: "",
  street2: "",
  city: "San Francisco",
  state: "CA",
  postcode: "94103",
  country: "US",
  phone: "",
  email: "",
};

function read(input: QuoteInput) {
  const tweaks = readTweaks(input.tweaks);
  const print = readPrintOptions(input.print);
  if (!print) return { error: "Pick the print options again." } as const;
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 4)
    return { error: "Unknown issue." } as const;
  if (!Number.isInteger(input.previewPages) || input.previewPages < 1 || input.previewPages > 1000)
    return { error: "The design hasn’t finished laying out yet." } as const;
  const pages = interiorPages(input.previewPages, tweaks);
  const problem = pagesProblem(pages, print);
  if (problem) return { error: problem } as const;
  return { tweaks, print, pages };
}

async function price(
  tweaks: Tweaks,
  print: PrintOptions,
  pages: number,
  address: Address | null,
  levels: ShippingLevel[],
): Promise<Omit<Extract<Quote, { ok: true }>, "ok" | "open" | "charge" | "leftCents">> {
  const item = { pod_package_id: podPackageId(tweaks, print), page_count: pages, quantity: print.quantity };
  if (!luluConfigured()) {
    const printCents = estimatePrintCents(pages, print) * print.quantity;
    const us = address?.country === "US";
    return {
      pages,
      estimate: true,
      printCents,
      shipping: us
        ? levels.map((level) => {
            const s = SHIPPING[level];
            const lulu = printCents + FULFILLMENT_CENTS + s.usCents + 150 * (print.quantity - 1);
            return { level, days: [...s.days], ...withFees(lulu) };
          })
        : [],
    };
  }
  const to = address ?? PLACEHOLDER;
  const asked: ShippingLevel[] = address ? levels : ["MAIL"];
  const [quotes, options] = await Promise.all([
    Promise.allSettled(asked.map((l) => quote(item, to, l))),
    address ? shippingOptions(item, to).catch(() => []) : Promise.resolve([]),
  ]);
  const ok = quotes.flatMap((q, i) => (q.status === "fulfilled" ? [{ level: asked[i], q: q.value }] : []));
  if (!ok.length) {
    const err = quotes.find((q) => q.status === "rejected")?.reason;
    throw err instanceof LuluError ? new Error(err.userMessage) : err;
  }
  return {
    pages,
    estimate: false,
    printCents: ok[0].q.printCents,
    shipping: address
      ? ok.map(({ level, q }) => {
          const o = options.find((x) => x.level === level);
          const days: [number, number] =
            o?.total_days_min && o.total_days_max
              ? [o.total_days_min, o.total_days_max]
              : [...SHIPPING[level].days];
          return { level, days, ...withFees(q.totalCents) };
        })
      : [],
  };
}

export async function quoteZine(input: QuoteInput): Promise<Quote> {
  try {
    await member();
    const r = read(input);
    if ("error" in r) return { ok: false, error: r.error! };
    let address: Address | null = null;
    if (input.address) {
      address = readAddress(input.address);
      if (!address) return { ok: false, error: "We can’t ship to that country yet." };
      if (addressProblem(address, false)) address = null;
    }
    const levels = Object.keys(SHIPPING) as ShippingLevel[];
    const [priced, allowance] = await Promise.all([
      price(r.tweaks, r.print, r.pages, address, levels),
      CHARGE_MEMBERS ? null : fetchAuthQuery(api.zineOrders.allowance, {}).catch(() => null),
    ]);
    return {
      ok: true,
      open: ordersOpen(),
      charge: CHARGE_MEMBERS,
      leftCents: allowance?.leftCents ?? null,
      ...priced,
    };
  } catch (err) {
    console.error("quoteZine failed", err);
    return { ok: false, error: errorMessage(err) };
  }
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "justwrite.club";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Prices the order again, saves it, and opens Stripe Checkout. The Stripe webhook takes it
// from there (lib/zine/fulfill.ts).
export async function checkoutZine(
  input: QuoteInput & { level: unknown },
): Promise<{ url: string } | { error: string }> {
  try {
    const me = await member();
    if (!ordersOpen())
      return { error: "Ordering isn’t open yet. The prices shown are estimates." };
    const r = read(input);
    if ("error" in r) return { error: r.error! };
    const address = readAddress(input.address);
    if (!address) return { error: "We can’t ship to that country yet." };
    const problem = addressProblem(address, true);
    if (problem) return { error: problem };
    const level = input.level as ShippingLevel;
    if (!(level in SHIPPING)) return { error: "Pick a shipping speed." };
    const q = await price(r.tweaks, r.print, r.pages, address, [level]);
    const ship = q.shipping[0];
    if (!ship) return { error: "That shipping speed isn’t available to this address." };

    const secret = serverSecret();
    const { quantity, ...print } = r.print;
    const order = {
      memberId: me._id,
      week: input.week,
      tweaks: JSON.stringify(r.tweaks),
      podPackageId: podPackageId(r.tweaks, r.print),
      print,
      quantity,
      pages: r.pages,
      shippingLevel: level,
      address,
      luluCents: ship.luluCents,
      feeCents: ship.feeCents,
      totalCents: ship.totalCents,
    };
    const origin = await siteOrigin();
    // Free for now: saved as paid (within the weekly cap) and sent to print right away.
    if (!CHARGE_MEMBERS) {
      const id: Id<"zineOrders"> = await fetchMutation(api.zineOrders.placeFree, { secret, ...order });
      after(() => startPrint(id, origin).catch((e) => console.error("startPrint failed", e)));
      return { url: `/zine/orders?placed=${id}` };
    }
    const orderId: Id<"zineOrders"> = await fetchMutation(api.zineOrders.createCheckout, {
      secret,
      ...order,
    });
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ship.totalCents,
            product_data: {
              name: `Just Write · Issue ${input.week}, printed`,
              description: `${quantity} ${quantity === 1 ? "copy" : "copies"}, ${r.pages} pages, ${SHIPPING[level].label.toLowerCase()} shipping to ${address.city}. Printed and shipped by Lulu.`,
            },
          },
        },
      ],
      customer_email: address.email,
      client_reference_id: orderId,
      metadata: { kind: "zine", order_id: orderId, member_id: me._id },
      payment_intent_data: {
        description: `Just Write zine, issue ${input.week}`,
        metadata: { kind: "zine", order_id: orderId },
      },
      success_url: `${origin}/zine/orders?placed=${orderId}`,
      cancel_url: `${origin}/zine?order=1`,
    });
    await fetchMutation(api.zineOrders.setStripeSession, { secret, id: orderId, sessionId: session.id });
    return { url: session.url! };
  } catch (err) {
    console.error("checkoutZine failed", err);
    return { error: errorMessage(err) };
  }
}

// Admins: try a failed order again: send its files to Lulu if they're made, else render.
export async function retryOrder(id: string): Promise<{ error?: string }> {
  try {
    const orderId = id as Id<"zineOrders">;
    const { hasFiles } = await fetchAuthMutation(api.zineOrders.claimRetry, { id: orderId });
    if (hasFiles) await submit(orderId);
    else await startPrint(orderId, await siteOrigin());
    return {};
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
