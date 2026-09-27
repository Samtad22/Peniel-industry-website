import { Lock } from "lucide-react";
import Link from "next/link";

// Pieces of the Peniel Ops v2 look, shared by the screens the design didn't
// draw: display-numeral KPIs, ink-ruled section heads, and the hatched
// ground for internal-only areas.

export type Kpi = { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; warn?: boolean; hot?: boolean };

/** A row of KPIs set as display numerals (design 2a). `hot` fills the cell red. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  const cols = items.length >= 5 ? "xl:grid-cols-5" : items.length === 4 ? "xl:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "";
  return (
    <div className={`grid grid-cols-2 ${items.length >= 4 ? "sm:grid-cols-3" : ""} ${cols}`}>
      {items.map((k) => {
        const body = (
          <>
            <h6 className={`m-0 ${k.hot ? "" : "opacity-60"}`}>{k.label}</h6>
            <span className="text-[48px] font-extrabold leading-[.9] tracking-[-.05em] sm:text-[64px]">{k.value}</span>
            {k.sub != null && <span className={`text-[13px] ${k.warn && !k.hot ? "font-extrabold text-accent-700" : ""}`}>{k.sub}</span>}
          </>
        );
        const cls = `flex min-w-0 flex-col gap-2 border-b-2 border-l-2 border-divider px-4 py-5 first:border-l-0 sm:px-6 xl:first:pl-8 max-sm:[&:nth-child(odd)]:border-l-0 ${
          k.hot ? "bg-accent text-bg" : "text-text"
        }`;
        return k.href ? (
          <Link key={k.label} href={k.href} className={`${cls} no-underline ${k.hot ? "hover:bg-accent-600 hover:text-bg" : "hover:bg-text/[.05] hover:text-text"}`}>
            {body}
          </Link>
        ) : (
          <div key={k.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** A section title over a 2px ink rule, with a note or actions on the right. */
export function SectionHead({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b-2 border-text pb-2.5">
      <h2 className="m-0 text-[26px] sm:text-[30px]">{title}</h2>
      {(aside || children) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {aside && <span className="text-[13px] opacity-70">{aside}</span>}
          {children}
        </div>
      )}
    </div>
  );
}

/** An internal-only area on the hatched ground, labelled so nobody mistakes it for something customers see. */
export function InternalPanel({ label = "INTERNAL · NEVER VISIBLE TO CUSTOMERS", children, className = "" }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`internal-ground flex flex-col gap-2.5 border-2 border-neutral-400 p-4 sm:p-[18px] ${className}`}>
      <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[.1em]">
        <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
        {label}
      </span>
      {children}
    </div>
  );
}
