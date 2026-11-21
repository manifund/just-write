// Lulu's Print API (https://api.lulu.com/docs/): quotes, cover sizes, and print jobs for
// /zine orders. Server-only. Set LULU_CLIENT_KEY and LULU_CLIENT_SECRET (from
// developers.lulu.com, or developers.sandbox.lulu.com with LULU_ENV=sandbox). Lulu charges
// the card saved on that Lulu account for each print job; customers pay us through Stripe.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address, ShippingLevel } from "./zine/print";

const BASE =
  process.env.LULU_ENV === "sandbox"
    ? "https://api.sandbox.lulu.com"
    : "https://api.lulu.com";

export const luluConfigured = () =>
  !!process.env.LULU_CLIENT_KEY && !!process.env.LULU_CLIENT_SECRET;

let token: { value: string; until: number } | null = null;

async function accessToken() {
  if (token && token.until > Date.now() + 30_000) return token.value;
  const key = process.env.LULU_CLIENT_KEY;
  const secret = process.env.LULU_CLIENT_SECRET;
  if (!key || !secret) throw new Error("Lulu keys aren't set.");
  const res = await fetch(
    `${BASE}/auth/realms/glasstree/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`Lulu sign-in failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function lulu<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
      "cache-control": "no-cache",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new LuluError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

export class LuluError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Lulu answered ${status}: ${body.slice(0, 300)}`);
    this.name = "LuluError";
  }
  // Lulu's field errors, flattened to one readable line when there are any.
  get userMessage() {
    try {
      const flat: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === "string") flat.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
      };
      walk(JSON.parse(this.body));
      if (flat.length) return flat.slice(0, 3).join(" ");
    } catch {}
    return "The printer couldn’t give a price for that.";
  }
}

const luluAddress = (a: Address) => ({
  name: a.name || undefined,
  street1: a.street1 || "1 Main St", // quotes only need the region; Lulu wants a street anyway
  street2: a.street2 || undefined,
  city: a.city || "City",
  state_code: a.state || undefined,
  country_code: a.country,
  postcode: a.postcode,
  phone_number: a.phone || "+1 415 555 0100",
  email: a.email || undefined,
});

type LineItem = { pod_package_id: string; page_count: number; quantity: number };

type CostCalculation = {
  total_cost_incl_tax: string;
  total_tax: string;
  shipping_cost: { total_cost_incl_tax: string };
  fulfillment_cost?: { total_cost_incl_tax: string };
  line_item_costs: { total_cost_incl_tax: string }[];
};

const cents = (s: string | undefined) => Math.round(Number(s ?? 0) * 100);

// Lulu's price for printing and shipping, tax included.
export async function quote(item: LineItem, address: Address, level: ShippingLevel) {
  const c = await lulu<CostCalculation>("/print-job-cost-calculations/", {
    body: {
      line_items: [item],
      shipping_address: luluAddress(address),
      shipping_option: level,
    },
  });
  return {
    totalCents: cents(c.total_cost_incl_tax),
    taxCents: cents(c.total_tax),
    shippingCents: cents(c.shipping_cost.total_cost_incl_tax),
    printCents: c.line_item_costs.reduce((n, l) => n + cents(l.total_cost_incl_tax), 0),
  };
}

type ShippingOption = {
  level: string;
  total_days_min?: number;
  total_days_max?: number;
  min_delivery_date?: string;
  max_delivery_date?: string;
};

// The shipping levels Lulu offers to this address, with their delivery windows.
export async function shippingOptions(item: LineItem, address: Address) {
  const list = await lulu<ShippingOption[] | { results: ShippingOption[] }>(
    "/shipping-options/",
    {
      body: {
        line_items: [{ pod_package_id: item.pod_package_id, page_count: item.page_count, quantity: item.quantity }],
        shipping_address: { country: address.country, state_code: address.state || undefined, postcode: address.postcode },
        currency: "USD",
      },
    },
  );
  return Array.isArray(list) ? list : list.results;
}

// The cover's full size (back, spine, front, with bleed) for this product and page count.
export async function coverDimensions(podPackageId: string, pages: number) {
  const d = await lulu<{ width: string; height: string; unit: string }>("/cover-dimensions/", {
    body: { pod_package_id: podPackageId, interior_page_count: pages, unit: "pt" },
  });
  return { widthPt: Number(d.width), heightPt: Number(d.height) };
}

export type PrintJob = {
  id: number;
  status: { name: string; message?: string };
  line_items: {
    status?: { name: string; messages?: Record<string, unknown> };
    tracking_id?: string | null;
    tracking_urls?: string[] | null;
    carrier_name?: string | null;
  }[];
};

export async function createPrintJob(job: {
  externalId: string;
  title: string;
  podPackageId: string;
  quantity: number;
  interiorUrl: string;
  coverUrl: string;
  address: Address;
  level: ShippingLevel;
}) {
  return await lulu<PrintJob>("/print-jobs/", {
    body: {
      contact_email: process.env.LULU_CONTACT_EMAIL ?? "austin@manifund.org",
      external_id: job.externalId,
      line_items: [
        {
          external_id: job.externalId,
          title: job.title,
          quantity: job.quantity,
          printable_normalization: {
            pod_package_id: job.podPackageId,
            interior: { source_url: job.interiorUrl },
            cover: { source_url: job.coverUrl },
          },
        },
      ],
      shipping_address: luluAddress(job.address),
      shipping_level: job.level,
    },
  });
}

export const getPrintJob = (id: number) => lulu<PrintJob>(`/print-jobs/${id}/`);

// Lulu signs webhook bodies with HMAC-SHA256 of the raw body, keyed by the client secret.
export function verifyWebhook(body: string, signature: string | null) {
  const secret = process.env.LULU_CLIENT_SECRET;
  if (!secret || !signature) return false;
  const want = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(want);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

// Registers our webhook for print job status changes (scripts/lulu-webhook.ts).
export const registerWebhook = (url: string) =>
  lulu("/webhooks/", { body: { topics: ["PRINT_JOB_STATUS_CHANGED"], url } });

export function tracking(job: PrintJob) {
  return job.line_items.flatMap((l) =>
    l.tracking_id || l.tracking_urls?.length
      ? [{ number: l.tracking_id ?? undefined, url: l.tracking_urls?.[0], carrier: l.carrier_name ?? undefined }]
      : [],
  );
}
