"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import {
  BODY_FONTS,
  DEFAULTS,
  DISPLAY_FONTS,
  PALETTES,
  type FontOption,
  type PaletteOption,
  type Selection,
} from "./options";

const byId = <T extends { id: string }>(list: T[], id: string) =>
  list.find((o) => o.id === id) ?? list[0];

/** Overrides the theme variables from globals.css for everything inside. */
function themeVars(sel: Selection): CSSProperties {
  const display = byId(DISPLAY_FONTS, sel.display);
  const body = byId(BODY_FONTS, sel.body);
  const palette = byId(PALETTES, sel.palette);
  const vars: Record<string, string> = {
    "--font-display": `var(${display.cssVar}), Georgia, serif`,
    "--font-body": `var(${body.cssVar}), Georgia, serif`,
    "--body-size-adjust": body.sizeAdjust ? String(body.sizeAdjust) : "none",
  };
  for (const [name, value] of Object.entries(palette.colors)) {
    vars[`--color-${name}`] = value;
  }
  return vars as CSSProperties;
}

export function Tweaks({
  initial,
  fontVars,
  children,
}: {
  initial: Selection;
  fontVars: string;
  children: ReactNode;
}) {
  const [sel, setSel] = useState(initial);
  const [open, setOpen] = useState(true);

  // Keep the URL in sync so a combination can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const key of ["display", "body", "palette"] as const) {
      if (sel[key] === DEFAULTS[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, sel[key]);
    }
    window.history.replaceState(null, "", url);
  }, [sel]);

  const set = (key: keyof Selection) => (id: string) => setSel((s) => ({ ...s, [key]: id }));
  const palette = byId(PALETTES, sel.palette);

  return (
    <div
      data-tweaks
      className={`${fontVars} min-h-dvh bg-cream font-body text-ink`}
      style={themeVars(sel)}
    >
      {children}

      <div className="fixed right-4 bottom-4 left-4 z-50 flex justify-end font-sans text-[13px] text-[#1d1d1f] sm:left-auto">
        {open ? (
          <aside
            aria-label="Design tweaks"
            className="flex max-h-[45dvh] sm:max-h-[min(640px,calc(100dvh-32px))] w-full flex-col overflow-hidden rounded-xl border border-black/10 bg-[#fbfbfa] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_40px_-8px_rgba(0,0,0,0.28)] sm:w-[316px]"
          >
            <header className="flex items-center gap-1 border-b border-black/8 py-2 pr-2 pl-4">
              <h2 className="mr-auto text-[13px] font-semibold">Tweaks</h2>
              <HeaderButton
                onClick={() => setSel(DEFAULTS)}
                disabled={
                  sel.display === DEFAULTS.display &&
                  sel.body === DEFAULTS.body &&
                  sel.palette === DEFAULTS.palette
                }
              >
                Reset
              </HeaderButton>
              <CopyLink />
              <HeaderButton onClick={() => setOpen(false)} aria-label="Hide tweaks">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 6h8" />
                </svg>
              </HeaderButton>
            </header>

            <div className="flex flex-col gap-5 overflow-y-auto px-4 pt-3.5 pb-4">
              <FontGroup
                legend="Headline font"
                options={DISPLAY_FONTS}
                value={sel.display}
                onChange={set("display")}
              />
              <FontGroup
                legend="Body font"
                options={BODY_FONTS}
                value={sel.body}
                onChange={set("body")}
              />
              <PaletteGroup value={sel.palette} onChange={set("palette")} />
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-[#fbfbfa] py-2 pr-4 pl-2.5 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-6px_rgba(0,0,0,0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f]"
          >
            <Swatch palette={palette} size="sm" />
            Tweaks
          </button>
        )}
      </div>
    </div>
  );
}

function HeaderButton(props: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-2 text-[12px] font-medium text-[#1d1d1f]/70 hover:bg-black/5 hover:text-[#1d1d1f] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[#1d1d1f] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
    />
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <HeaderButton
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
        } catch {
          // Clipboard blocked; the URL bar has the same link.
        }
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </HeaderButton>
  );
}

const tile =
  "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border border-black/10 bg-white p-2.5 transition-[border-color,box-shadow] duration-150 hover:border-black/25 has-checked:border-[#1d1d1f] has-checked:shadow-[inset_0_0_0_1px_#1d1d1f] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[#1d1d1f]";

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[12px] font-medium text-[#1d1d1f]/60">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </fieldset>
  );
}

function FontGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: FontOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const name = useId();
  return (
    <Group legend={legend}>
      {options.map((o) => (
        <label key={o.id} className={tile}>
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className="text-[30px] leading-none text-[#1d1d1f]"
            style={{ fontFamily: `var(${o.cssVar})`, fontSizeAdjust: o.sizeAdjust }}
          >
            Aa<em className="italic">g</em>
          </span>
          <span className="truncate text-[12px] text-[#1d1d1f]/75">{o.name}</span>
        </label>
      ))}
    </Group>
  );
}

function PaletteGroup({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const name = useId();
  return (
    <Group legend="Colors">
      {PALETTES.map((p) => (
        <label key={p.id} className={tile}>
          <input
            type="radio"
            name={name}
            value={p.id}
            checked={value === p.id}
            onChange={() => onChange(p.id)}
            className="sr-only"
          />
          <Swatch palette={p} />
          <span className="truncate text-[12px] text-[#1d1d1f]/75">{p.name}</span>
        </label>
      ))}
    </Group>
  );
}

/** A miniature of the page: ink panel with its accent, beside the paper side. */
function Swatch({ palette, size = "md" }: { palette: PaletteOption; size?: "sm" | "md" }) {
  const c = palette.colors;
  const sm = size === "sm";
  return (
    <span
      aria-hidden="true"
      className={`flex overflow-hidden rounded-[4px] ring-1 ring-black/10 ${sm ? "h-5 w-8" : "h-[30px] w-full"}`}
    >
      <span className="flex flex-1 items-end p-1" style={{ background: c.ink }}>
        <span className={`rounded-full ${sm ? "size-1.5" : "h-1 w-1/2"}`} style={{ background: c["brass-light"] }} />
      </span>
      <span className="flex flex-1 items-end p-1" style={{ background: c.cream }}>
        {!sm && <span className="h-1 w-2/3 rounded-full" style={{ background: c["ink-muted"] }} />}
      </span>
    </span>
  );
}
