/**
 * ui.tsx — small presentational pieces for the planner.
 * -----------------------------------------------------------------------------
 * Visual language from the design prototype (`Avisha Planner.dc.html`): ivory
 * ground, warm surface cards, charcoal text, antique-gold accent, Marcellus
 * headings over Barlow body.
 *
 * One deliberate deviation: the prototype's accent `#A8842C` is ~3.3:1 on
 * white, below WCAG AA for body-size text. It stays for rules and borders;
 * text and filled buttons use the deeper `ACCENT_TEXT` (~5.9:1).
 */

import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";

export const C = {
  ivory: "#FDFBF7",
  surface: "#F6F2EA",
  text: "#20242B",
  muted: "#55595F",
  accent: "#A8842C",
  accentText: "#7A5F1E",
  line: "#E2D8C4",
  danger: "#9B1C1C",
} as const;

export const HEADING_FONT = "var(--font-marcellus), Georgia, serif";
export const BODY_FONT = "var(--font-barlow), system-ui, sans-serif";

export const inputClass =
  "w-full rounded-md border border-[#E2D8C4] bg-white px-3 py-2 text-[15px] text-[#20242B] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#A8842C]";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span style={{ color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}

type Variant = "primary" | "ghost" | "danger";

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }): JSX.Element {
  const look: Record<Variant, string> = {
    primary: "bg-[#7A5F1E] text-white border-[#7A5F1E] hover:bg-[#654E18]",
    ghost: "bg-white text-[#20242B] border-[#E2D8C4] hover:border-[#A8842C]",
    danger: "bg-white text-[#9B1C1C] border-[#E2D8C4] hover:border-[#9B1C1C]",
  };
  return (
    <button
      type="button"
      {...props}
      className={`min-h-[40px] rounded-full border px-4 py-2 text-sm transition-colors focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#A8842C] disabled:opacity-40 ${look[variant]} ${className}`}
    />
  );
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className="rounded-xl border p-4 sm:p-5"
      style={{ background: C.surface, borderColor: C.line }}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h3 className="text-lg" style={{ fontFamily: HEADING_FONT }}>
              {title}
            </h3>
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: C.line }}
    >
      <div className="text-2xl" style={{ fontFamily: HEADING_FONT }}>
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.14em]" style={{ color: C.muted }}>
        {label}
      </div>
    </div>
  );
}
