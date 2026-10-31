"use client";

import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { normalizeHex } from "./derive";
import {
  BODY_FONTS,
  CUSTOM_PALETTE,
  DEFAULTS,
  DISPLAY_FONTS,
  PALETTES,
  resolvePalette,
  type FontOption,
  type Palette,
  type PaletteOption,
  type Selection,
} from "./options";

const byId = <T extends { id: string }>(list: T[], id: string) =>
  list.find((o) => o.id === id) ?? list[0];

/** Overrides the theme variables from globals.css for everything inside. */
function themeVars(sel: Selection): CSSProperties {
  const display = byId(DISPLAY_FONTS, sel.display);
  const body = byId(BODY_FONTS, sel.body);
  const palette = resolvePalette(sel);
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

  // Keep the URL in sync so a combination can be shared. Debounced because
  // dragging a color picker fires many changes, and Safari rate-limits
  // replaceState.
  useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      const custom = sel.palette === CUSTOM_PALETTE;
      for (const key of [
        "display",
        "body",
        "palette",
        "ink",
        "accent",
      ] as const) {
        // A preset brings its own colors, so the custom picks only matter for custom.
        const skip = (key === "ink" || key === "accent") && !custom;
        if (skip || sel[key] === DEFAULTS[key]) url.searchParams.delete(key);
        else url.searchParams.set(key, sel[key].replace(/^#/, ""));
      }
      window.history.replaceState(null, "", url);
    }, 150);
    return () => clearTimeout(t);
  }, [sel]);

  const set = (key: "display" | "body") => (id: string) =>
    setSel((s) => ({ ...s, [key]: id }));
  const pickPreset = (id: string) => {
    const preset = byId(PALETTES, id);
    setSel((s) => ({
      ...s,
      palette: id,
      ink: preset.colors.ink,
      accent: preset.colors.brass,
    }));
  };
  const pickColor = (key: "ink" | "accent") => (hex: string) =>
    setSel((s) => ({ ...s, palette: CUSTOM_PALETTE, [key]: hex }));
  const palette = resolvePalette(sel);
  const isDefault = (Object.keys(DEFAULTS) as (keyof Selection)[]).every(
    (k) => sel[k] === DEFAULTS[k],
  );

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
                disabled={isDefault}
              >
                Reset
              </HeaderButton>
              <CopyLink />
              <HeaderButton
                onClick={() => setOpen(false)}
                aria-label="Hide tweaks"
              >
                <svg
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
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
              <PaletteGroup value={sel.palette} onChange={pickPreset} />
              <CustomColors
                active={sel.palette === CUSTOM_PALETTE}
                ink={sel.ink}
                accent={sel.accent}
                colors={palette.colors}
                onInk={pickColor("ink")}
                onAccent={pickColor("accent")}
              />
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
      <legend className="mb-2 text-[12px] font-medium text-[#1d1d1f]/60">
        {legend}
      </legend>
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
            style={{
              fontFamily: `var(${o.cssVar})`,
              fontSizeAdjust: o.sizeAdjust,
            }}
          >
            Aa<em className="italic">g</em>
          </span>
          <span className="truncate text-[12px] text-[#1d1d1f]/75">
            {o.name}
          </span>
        </label>
      ))}
    </Group>
  );
}

function PaletteGroup({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
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
          <span className="truncate text-[12px] text-[#1d1d1f]/75">
            {p.name}
          </span>
        </label>
      ))}
    </Group>
  );
}

/** A miniature of the page: ink panel with its accent, beside the paper side. */
function Swatch({
  palette,
  size = "md",
}: {
  palette: PaletteOption;
  size?: "sm" | "md";
}) {
  const c = palette.colors;
  const sm = size === "sm";
  return (
    <span
      aria-hidden="true"
      className={`flex overflow-hidden rounded-[4px] ring-1 ring-black/10 ${sm ? "h-5 w-8" : "h-[30px] w-full"}`}
    >
      <span className="flex flex-1 items-end p-1" style={{ background: c.ink }}>
        <span
          className={`rounded-full ${sm ? "size-1.5" : "h-1 w-1/2"}`}
          style={{ background: c["brass-light"] }}
        />
      </span>
      <span
        className="flex flex-1 items-end p-1"
        style={{ background: c.cream }}
      >
        {!sm && (
          <span
            className="h-1 w-2/3 rounded-full"
            style={{ background: c["ink-muted"] }}
          />
        )}
      </span>
    </span>
  );
}

/**
 * Two color wells that drive a generated palette. Shows the generated colors
 * underneath so it's clear what each pick turns into.
 */
function CustomColors({
  active,
  ink,
  accent,
  colors,
  onInk,
  onAccent,
}: {
  active: boolean;
  ink: string;
  accent: string;
  colors: Palette;
  onInk: (hex: string) => void;
  onAccent: (hex: string) => void;
}) {
  return (
    <fieldset
      className={`-mt-2 flex flex-col gap-2.5 rounded-lg border bg-white p-2.5 transition-[border-color,box-shadow] duration-150 ${
        active
          ? "border-[#1d1d1f] shadow-[inset_0_0_0_1px_#1d1d1f]"
          : "border-black/10"
      }`}
    >
      <legend className="sr-only">Custom colors</legend>
      <div className="flex items-baseline justify-between">
        <span
          aria-hidden="true"
          className="text-[12px] font-medium text-[#1d1d1f]/75"
        >
          Custom
        </span>
        <span className="text-[11px] text-[#1d1d1f]/45">
          {active ? "Built from your two colors" : "Pick a color to start"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Base" value={ink} onChange={onInk} />
        <ColorField label="Accent" value={accent} onChange={onAccent} />
      </div>
      <Ramp colors={colors} dimmed={!active} />
    </fieldset>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  // While typing, the text field shows a draft so a half-typed hex doesn't
  // snap back; otherwise it shows the current color.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-hex`} className="text-[11px] text-[#1d1d1f]/55">
        {label}
      </label>
      <div className="flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-[#fbfbfa] pr-1.5 pl-1 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-[#1d1d1f]">
        <span
          className="relative size-6 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-black/15 ring-inset"
          style={{ background: value }}
        >
          <input
            type="color"
            aria-label={`${label} color`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          value={draft ?? value}
          onChange={(e) => {
            setDraft(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setDraft(null)}
          className="w-full min-w-0 bg-transparent text-[12px] text-[#1d1d1f] tabular-nums outline-none"
        />
      </div>
    </div>
  );
}

const RAMP: { key: keyof Palette; role: string }[][] = [
  [
    { key: "ink", role: "Ink" },
    { key: "ink-muted", role: "Muted ink" },
    { key: "wash", role: "Wash" },
    { key: "wash-light", role: "Light wash" },
    { key: "cream-deep", role: "Deep paper" },
    { key: "cream", role: "Paper" },
  ],
  [
    { key: "brass-text", role: "Accent text" },
    { key: "brass-numeral", role: "Accent numerals" },
    { key: "brass", role: "Accent" },
    { key: "brass-light", role: "Light accent" },
  ],
];

/** The generated colors, grouped by the pick they come from. */
function Ramp({ colors, dimmed }: { colors: Palette; dimmed: boolean }) {
  return (
    <div
      role="img"
      aria-label={`Generated colors: ${RAMP.flat()
        .map((r) => `${r.role} ${colors[r.key]}`)
        .join(", ")}`}
      className={`flex gap-1 transition-opacity duration-150 ${dimmed ? "opacity-50" : ""}`}
    >
      {RAMP.map((group, i) => (
        <span
          key={i}
          className="flex overflow-hidden rounded-[3px] ring-1 ring-black/10"
          style={{ flex: group.length }}
        >
          {group.map((r) => (
            <span
              key={r.key}
              title={`${r.role} ${colors[r.key]}`}
              className="h-3.5 flex-1"
              style={{ background: colors[r.key] }}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
