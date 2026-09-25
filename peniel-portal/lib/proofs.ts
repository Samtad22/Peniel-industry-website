import type { CSSProperties } from "react";

export type ProofStatus = "sent" | "approved" | "changes_requested";

/** Proof badges (design pill styles), worded for each side. */
export function proofPill(status: ProofStatus, audience: "staff" | "customer"): { label: string; style: CSSProperties } {
  switch (status) {
    case "sent":
      return {
        label: audience === "customer" ? "● Awaiting your approval" : "Awaiting customer",
        style: audience === "customer" ? { background: "var(--color-accent)", color: "var(--color-bg)", fontWeight: 800 } : { borderColor: "var(--color-accent)", color: "var(--color-accent-700)" },
      };
    case "approved":
      return { label: "✓ Approved", style: { background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" } };
    case "changes_requested":
      return { label: "↺ Changes requested", style: { background: "var(--color-accent-100)", color: "var(--color-accent-800)", borderColor: "var(--color-accent-300)" } };
  }
}
