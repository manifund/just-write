"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePortal } from "@/components/portal/context";
import {
  BINDINGS,
  COUNTRIES,
  DEFAULT_PRINT,
  DEFAULT_SHIPPING,
  FINISHES,
  INKS,
  MAX_QUANTITY,
  NEEDS_STATE,
  PAPERS,
  SHIPPING,
  WEEKLY_CAP_CENTS,
  addressProblem,
  arrivalRange,
  dollars,
  interiorPages,
  pagesProblem,
  type Address,
  type PrintOptions,
  type ShippingLevel,
} from "@/lib/zine/print";
import type { Tweaks } from "@/lib/zine/tweaks";
import { checkoutZine, quoteZine, type Quote } from "./actions";

const DRAFT = "zine:order";

const EMPTY: Address = {
  name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  postcode: "",
  country: "US",
  phone: "",
  email: "",
};

// The Order panel beside the preview: print options, address, shipping speed, then the order
// (free within a weekly cap for now; Stripe once members pay).
// Prices come from the server (Lulu's live quote, or an estimate until Lulu is connected),
// and are worked out again there at checkout.
export function OrderPanel({
  week,
  tweaks,
  previewPages,
  custom,
  onClose,
}: {
  week: number;
  tweaks: Tweaks;
  previewPages: number | null;
  custom: boolean;
  onClose: () => void;
}) {
  const { me } = usePortal();
  const [print, setPrint] = useState<PrintOptions>(DEFAULT_PRINT);
  const [address, setAddress] = useState<Address>(EMPTY);
  const [level, setLevel] = useState<ShippingLevel>(DEFAULT_SHIPPING);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, startPaying] = useTransition();
  const filled = useRef(false);

  // Start from the last address used here (this browser), else from the last paid order.
  useEffect(() => {
    if (filled.current) return;
    filled.current = true;
    let draft: Partial<{ address: Address; print: PrintOptions; level: ShippingLevel }> = {};
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT) ?? "{}");
    } catch {}
    setAddress({
      ...EMPTY,
      name: me.name,
      email: me.email,
      ...(draft.address ?? {}),
    });
    if (draft.print) setPrint({ ...DEFAULT_PRINT, ...draft.print });
    if (draft.level && draft.level in SHIPPING) setLevel(draft.level);
  }, [me]);

  useEffect(() => {
    if (!filled.current) return;
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ address, print, level }));
    } catch {}
  }, [address, print, level]);

  const pages = previewPages === null ? null : interiorPages(previewPages, tweaks);
  const tooMany = pages === null ? null : pagesProblem(pages, print);
  const quotable = !addressProblem(address, false);
  // Only the parts of the address that change the price.
  const where = quotable ? `${address.country}|${address.state}|${address.postcode}` : "";

  useEffect(() => {
    if (previewPages === null || tooMany) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setQuoting(true);
      const q = await quoteZine({
        week,
        tweaks,
        previewPages,
        print,
        address: where ? address : null,
      });
      if (stale) return;
      setQuoting(false);
      setQuote(q);
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `address` is read through `where`, so typing a street doesn't ask for a new price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, tweaks, previewPages, print, where, tooMany]);

  const ok = quote?.ok ? quote : null;
  const chosen = ok?.shipping.find((s) => s.level === level) ?? null;
  const full = addressProblem(address, true);
  const overCap =
    !!ok && !ok.charge && !!chosen && chosen.totalCents > (ok.leftCents ?? WEEKLY_CAP_CENTS);

  const setP = <K extends keyof PrintOptions>(k: K, v: PrintOptions[K]) =>
    setPrint((p) => ({ ...p, [k]: v }));
  const setA = (k: keyof Address, v: string) => setAddress((a) => ({ ...a, [k]: v }));

  const pay = () => {
    setError(null);
    startPaying(async () => {
      const r = await checkoutZine({ week, tweaks, previewPages: previewPages ?? 0, print, address, level });
      if ("url" in r) window.location.assign(r.url);
      else setError(r.error);
    });
  };

  const summary = useMemo(
    () =>
      [
        `Issue ${week}`,
        pages !== null ? `${pages} pages` : null,
        custom ? "your design" : "the standard design",
      ]
        .filter(Boolean)
        .join(" · "),
    [week, pages, custom],
  );

  return (
    <aside className="flex shrink-0 flex-col gap-6 overflow-y-auto border-t border-ink/10 bg-paper px-5 py-5 text-[14px] lg:max-h-full lg:w-[360px] lg:border-t-0 lg:border-l">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] leading-tight font-[400]">Order a printed copy</h2>
          <p className="mt-1 text-ink-muted">{summary}. Printed and shipped by Lulu.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer px-1 text-[20px] leading-none text-ink-muted hover:text-ink">
          ×
        </button>
      </header>

      <Section title="Copy">
        <div className="flex items-center justify-between">
          <span>Copies</span>
          <div className="flex items-center">
            <Step onClick={() => setP("quantity", Math.max(1, print.quantity - 1))} label="Fewer">−</Step>
            <span className="w-9 text-center tabular-nums">{print.quantity}</span>
            <Step onClick={() => setP("quantity", Math.min(MAX_QUANTITY, print.quantity + 1))} label="More">+</Step>
          </div>
        </div>
        <Choices
          value={print.ink}
          options={Object.entries(INKS).map(([k, v]) => [k as PrintOptions["ink"], v.label, v.note])}
          onChange={(v) => setP("ink", v)}
        />
        <Row label="Binding">
          <Segments value={print.binding} options={Object.entries(BINDINGS).map(([k, v]) => [k as PrintOptions["binding"], v.label])} onChange={(v) => setP("binding", v)} />
        </Row>
        <Row label="Paper">
          <Segments value={print.paper} options={Object.entries(PAPERS).map(([k, v]) => [k as PrintOptions["paper"], v.label])} onChange={(v) => setP("paper", v)} />
        </Row>
        <Row label="Cover">
          <Segments value={print.finish} options={Object.entries(FINISHES).map(([k, v]) => [k as PrintOptions["finish"], v.label.replace(" cover", "")])} onChange={(v) => setP("finish", v)} />
        </Row>
        {tooMany ? (
          <p className="text-brass-text">{tooMany}</p>
        ) : (
          <p className="text-ink-muted">
            {pages === null
              ? "Waiting for the layout…"
              : ok
                ? `Printing: ${dollars(ok.printCents)}${print.quantity > 1 ? ` for ${print.quantity}` : ""}${ok.estimate ? " (estimate)" : ""}`
                : quoting
                  ? "Pricing…"
                  : ""}
          </p>
        )}
      </Section>

      <Section title="Ship to">
        <Field label="Name" value={address.name} onChange={(v) => setA("name", v)} autoComplete="name" />
        <Field label="Street" value={address.street1} onChange={(v) => setA("street1", v)} autoComplete="address-line1" />
        <Field label="Apt, suite" value={address.street2} onChange={(v) => setA("street2", v)} autoComplete="address-line2" optional />
        <Field label="City" value={address.city} onChange={(v) => setA("city", v)} autoComplete="address-level2" />
        <div className="grid grid-cols-2 gap-2">
          {NEEDS_STATE.has(address.country) && (
            <Field label="State" value={address.state} onChange={(v) => setA("state", v.toUpperCase())} autoComplete="address-level1" placeholder="CA" />
          )}
          <Field label="Postal code" value={address.postcode} onChange={(v) => setA("postcode", v)} autoComplete="postal-code" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-muted">Country</span>
          <select
            value={address.country}
            onChange={(e) => setA("country", e.target.value)}
            autoComplete="country"
            className="border border-ink/20 bg-paper px-2 py-1.5"
          >
            {COUNTRIES.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Field label="Phone (for the carrier)" value={address.phone} onChange={(v) => setA("phone", v)} autoComplete="tel" type="tel" />
        <Field label="Email (for shipping updates)" value={address.email} onChange={(v) => setA("email", v)} autoComplete="email" type="email" />
      </Section>

      <Section title="Shipping">
        {!quotable ? (
          <p className="text-ink-muted">Enter a postal code{NEEDS_STATE.has(address.country) ? " and state" : ""} to see shipping options.</p>
        ) : ok && ok.shipping.length === 0 ? (
          <p className="text-ink-muted">
            {ok.estimate ? "Shipping outside the US is priced once ordering opens." : "Lulu doesn’t ship there."}
          </p>
        ) : (
          <div className="flex flex-col">
            {(Object.keys(SHIPPING) as ShippingLevel[]).map((l) => {
              const s = ok?.shipping.find((x) => x.level === l);
              if (ok && !s) return null;
              return (
                <label
                  key={l}
                  className={`-mt-px flex cursor-pointer items-center gap-3 border px-3 py-2 ${level === l ? "relative z-10 border-ink" : "border-ink/15"}`}
                >
                  <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} />
                  <span className="flex-1">
                    <span className="block">{SHIPPING[l].label}</span>
                    <span className="text-[12px] text-ink-muted">
                      Arrives about {arrivalRange(s?.days ?? SHIPPING[l].days)}
                    </span>
                  </span>
                  <span className="tabular-nums">{s ? dollars(s.totalCents) : quoting ? "…" : ""}</span>
                </label>
              );
            })}
            <p className="mt-2 text-[12px] text-ink-muted">
              Prices include printing and shipping{ok?.estimate ? "" : " and tax"}{ok?.charge ? ", plus the card fee" : ""}. Delivery
              dates are Lulu’s estimates, counted from today.
            </p>
          </div>
        )}
      </Section>

      <div className="flex flex-col gap-2 border-t border-ink/10 pt-4">
        {chosen && (
          <details className="text-ink-muted">
            <summary className="cursor-pointer">
              Total {dollars(chosen.totalCents)}
              {ok?.estimate ? " (estimate, before tax)" : ""}
              {ok && !ok.charge ? ", covered by Just Write" : ""}
            </summary>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
              <dt>Printing and shipping (Lulu)</dt>
              <dd>{dollars(chosen.luluCents)}</dd>
              {chosen.feeCents > 0 && (
                <>
                  <dt>Card fee</dt>
                  <dd>{dollars(chosen.feeCents)}</dd>
                </>
              )}
            </dl>
          </details>
        )}
        <button
          type="button"
          disabled={!chosen || !!full || paying || !ok?.open || overCap}
          onClick={pay}
          className="cursor-pointer bg-ink px-4 py-2.5 text-[15px] text-cream disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ok && !ok.charge
            ? paying
              ? "Placing order…"
              : "Place order"
            : paying
              ? "Opening checkout…"
              : chosen
                ? `Pay ${dollars(chosen.totalCents)}`
                : "Pay"}
        </button>
        {ok && !ok.open ? (
          <p className="text-[13px] text-ink-muted">Ordering isn’t open yet. The prices shown are estimates.</p>
        ) : overCap ? (
          <p className="text-[13px] text-brass-text">
            That’s more than the {dollars(WEEKLY_CAP_CENTS)} a week each member can order. You have{" "}
            {dollars(ok?.leftCents ?? 0)} left this week.
          </p>
        ) : chosen && full ? (
          <p className="text-[13px] text-ink-muted">{full}</p>
        ) : ok && !ok.charge ? (
          <p className="text-[13px] text-ink-muted">
            Free for members for now, up to {dollars(WEEKLY_CAP_CENTS)} a week
            {ok.leftCents !== null && ok.leftCents < WEEKLY_CAP_CENTS ? ` (${dollars(ok.leftCents)} left)` : ""}. We print
            your copy as it looks here.
          </p>
        ) : (
          <p className="text-[13px] text-ink-muted">You’ll pay on Stripe. We print your copy as it looks here.</p>
        )}
        {(error ?? (quote && !quote.ok ? quote.error : null)) && (
          <p className="text-[13px] text-brass-text">{error ?? (quote && !quote.ok ? quote.error : null)}</p>
        )}
        <Link href="/zine/orders" className="self-start text-[13px] text-ink-muted underline">
          Your orders
        </Link>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[12px] tracking-[0.12em] text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Step({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="cursor-pointer border border-ink/20 px-2 py-0.5 hover:bg-cream-hover">
      {children}
    </button>
  );
}

function Segments<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: [V, string][];
  onChange: (v: V) => void;
}) {
  return (
    <div className="flex" role="group">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`-ml-px cursor-pointer border px-2 py-0.5 first:ml-0 ${
            value === v ? "relative z-10 border-ink bg-ink text-cream" : "border-ink/20 hover:bg-cream-hover"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Choices<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: [V, string, string][];
  onChange: (v: V) => void;
}) {
  return (
    <div className="flex flex-col">
      {options.map(([v, l, note]) => (
        <label
          key={v}
          className={`-mt-px flex cursor-pointer items-baseline gap-3 border px-3 py-2 ${value === v ? "relative z-10 border-ink" : "border-ink/15"}`}
        >
          <input type="radio" checked={value === v} onChange={() => onChange(v)} />
          <span>
            <span className="block">{l}</span>
            <span className="text-[12px] text-ink-muted">{note}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  optional,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-ink-muted">
        {label}
        {optional ? " (optional)" : ""}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-ink/20 bg-paper px-2 py-1.5"
      />
    </label>
  );
}
