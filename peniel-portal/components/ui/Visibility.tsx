import { Eye, Lock } from "lucide-react";

// The design's two markers for any value staff enter: whether it reaches the
// customer portal or stays internal (CLAUDE.md rules 2 and 4).

export function CustomerSees({ children = "Customer sees this" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-[.04em] text-accent-800">
      <Eye size={12} strokeWidth={2.2} aria-hidden="true" />
      {children}
    </span>
  );
}

export function InternalOnly({ children = "Internal only" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold tracking-[.04em] text-neutral-800">
      <Lock size={12} strokeWidth={2.2} aria-hidden="true" />
      {children}
    </span>
  );
}
