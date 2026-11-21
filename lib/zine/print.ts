// Print options for ordering a copy of the zine through Lulu's Print API (lib/lulu.ts), and
// the prices we charge. Used by /zine's Order panel and by its server actions; no secrets.
import { TRIMS, type Tweaks } from "./tweaks";

export const BINDINGS = {
  PB: { label: "Paperback", note: "Glued spine, like a magazine annual", min: 32, max: 800 },
  CO: { label: "Coil bound", note: "Lies flat when open", min: 2, max: 470 },
} as const;

export const INKS = {
  FCSTD: { label: "Standard color", note: "Good for text and most images" },
  FCPRE: { label: "Premium color", note: "Richer images, about 3× the cost" },
  BWSTD: { label: "Black and white", note: "Cheapest; images print in gray" },
} as const;

export const PAPERS = {
  "080CW444": { label: "80# coated", note: "Smooth, a little heavier" },
  "060UW444": { label: "60# uncoated", note: "Like a paperback book" },
} as const;

export const FINISHES = {
  M: { label: "Matte cover" },
  G: { label: "Gloss cover" },
} as const;

// Lulu's shipping levels we offer. `days` is order to door for one copy within the US, from
// Lulu's calculator on Nov 16, 2026; live quotes replace it once Lulu keys are set.
export const SHIPPING = {
  MAIL: { label: "Mail", days: [11, 13], usCents: 569 },
  GROUND: { label: "Ground", days: [9, 11], usCents: 1374 },
  EXPEDITED: { label: "Expedited", days: [6, 8], usCents: 2074 },
  EXPRESS: { label: "Express", days: [5, 7], usCents: 3574 },
} as const;

export type Binding = keyof typeof BINDINGS;
export type Ink = keyof typeof INKS;
export type Paper = keyof typeof PAPERS;
export type Finish = keyof typeof FINISHES;
export type ShippingLevel = keyof typeof SHIPPING;

export type PrintOptions = {
  binding: Binding;
  ink: Ink;
  paper: Paper;
  finish: Finish;
  quantity: number;
};

export const DEFAULT_PRINT: PrintOptions = {
  binding: "PB",
  ink: "FCSTD",
  paper: "080CW444",
  finish: "M",
  quantity: 1,
};
export const DEFAULT_SHIPPING: ShippingLevel = "GROUND";
export const MAX_QUANTITY = 20;

export type Address = {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string; // state or province code; required for US, CA, AU
  postcode: string;
  country: string; // ISO 3166-1 alpha-2
  phone: string; // Lulu passes it to the carrier
  email: string;
};

export const COUNTRIES: [string, string][] = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["IE", "Ireland"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["IN", "India"],
  ["SG", "Singapore"],
  ["JP", "Japan"],
];
export const NEEDS_STATE = new Set(["US", "CA", "AU"]);

// For now members don't pay: Just Write covers Lulu's price (tax included), up to
// WEEKLY_CAP_CENTS per member over any 7 days (convex/zineOrders.ts#placeFree). With
// CHARGE_MEMBERS on, checkout goes through Stripe and adds its card fee plus MARKUP_CENTS.
export const CHARGE_MEMBERS = false;
export { WEEKLY_CAP_CENTS } from "@/convex/lib/zine";
export const MARKUP_CENTS = 0;
const STRIPE_PERCENT = 0.029;
const STRIPE_FIXED_CENTS = 30;

export function withFees(luluCents: number) {
  if (!CHARGE_MEMBERS) return { luluCents, feeCents: 0, totalCents: luluCents };
  const base = luluCents + MARKUP_CENTS;
  const total = Math.ceil((base + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT));
  return { luluCents, feeCents: total - luluCents, totalCents: total };
}

// Lulu's product code, e.g. 0850X1100FCSTDPB080CW444MXX: trim, ink, binding, paper, cover
// finish, then no linen and no foil.
export function podPackageId(t: Pick<Tweaks, "trim">, p: PrintOptions) {
  const trim = TRIMS[t.trim];
  const inches = (n: number) => String(Math.round(n * 100)).padStart(4, "0");
  return `${inches(trim.w)}X${inches(trim.h)}${p.ink}${p.binding}${p.paper}${p.finish}XX`;
}

// The interior's page count as Lulu counts it: the preview's pages without the cover (which
// prints separately), rounded up to an even number.
export function interiorPages(previewPages: number, t: Pick<Tweaks, "cover">) {
  const n = previewPages - (t.cover ? 1 : 0);
  return n + (n % 2);
}

// Why these options can't print this many pages, if they can't.
export function pagesProblem(pages: number, p: PrintOptions) {
  const b = BINDINGS[p.binding];
  if (pages < b.min) return `${b.label} needs at least ${b.min} pages; this design has ${pages}.`;
  if (pages > b.max) return `${b.label} takes at most ${b.max} pages; this design has ${pages}.`;
  return null;
}

// Rough Lulu prices for when no Lulu keys are set: fitted to its calculator's 140-page 8.5x11
// quotes on Nov 16, 2026, before tax. Coil binding is a guess.
export function estimatePrintCents(pages: number, p: PrintOptions) {
  const perPage = {
    FCSTD: { "080CW444": 6.4, "060UW444": 5.6 },
    FCPRE: { "080CW444": 21.5, "060UW444": 20.1 },
    BWSTD: { "080CW444": 4.6, "060UW444": 3.9 },
  }[p.ink][p.paper];
  const base = p.binding === "CO" ? 550 : 215;
  return Math.round(base + pages * perPage);
}

export const FULFILLMENT_CENTS = 75; // Lulu's per-order fee

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "Nov 27–29" from business days after today.
export function arrivalRange(days: readonly [number, number] | [number, number], from = new Date()) {
  const add = (n: number) => {
    const d = new Date(from);
    let left = n;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    return d;
  };
  const a = add(days[0]);
  const b = add(days[1]);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()}–${b.getDate()}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

export function readPrintOptions(raw: unknown): PrintOptions | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ok =
    typeof r.binding === "string" && r.binding in BINDINGS &&
    typeof r.ink === "string" && r.ink in INKS &&
    typeof r.paper === "string" && r.paper in PAPERS &&
    typeof r.finish === "string" && r.finish in FINISHES &&
    typeof r.quantity === "number" && Number.isInteger(r.quantity) &&
    r.quantity >= 1 && r.quantity <= MAX_QUANTITY;
  return ok ? (r as unknown as PrintOptions) : null;
}

export function readAddress(raw: unknown): Address | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (k: string, max = 120) =>
    typeof r[k] === "string" ? (r[k] as string).trim().slice(0, max) : "";
  const a: Address = {
    name: s("name"),
    street1: s("street1"),
    street2: s("street2"),
    city: s("city"),
    state: s("state", 3).toUpperCase(),
    postcode: s("postcode", 20),
    country: s("country", 2).toUpperCase(),
    phone: s("phone", 30),
    email: s("email", 200),
  };
  if (!COUNTRIES.some(([c]) => c === a.country)) return null;
  return a;
}

// What's missing before an address can be quoted (country, state, postcode) or shipped to.
export function addressProblem(a: Address, full: boolean) {
  if (NEEDS_STATE.has(a.country) && !/^[A-Z]{2,3}$/.test(a.state)) return "Enter the state or province code.";
  if (!a.postcode) return "Enter the postal code.";
  if (!full) return null;
  if (!a.name) return "Enter the name to ship to.";
  if (!a.street1) return "Enter the street address.";
  if (!a.city) return "Enter the city.";
  if (!/^[+\d][\d\s().-]{6,}$/.test(a.phone)) return "Enter a phone number; the carrier may need it.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) return "Enter an email for shipping updates.";
  return null;
}
