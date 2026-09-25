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

export type PhysicalDelivery = "courier" | "peniel_driver";

/** Where a customer can follow a courier shipment (DHL only for now). */
export function trackingUrl(courier: string | null, tracking: string | null): string | null {
  if (!tracking) return null;
  if (/^dhl/i.test(courier ?? "")) {
    return `https://www.dhl.com/et-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tracking.trim())}`;
  }
  return null;
}

/** "Physical sample · DHL 1234567890" — customer-safe (never the driver or vehicle). */
export function deliveryLine(p: { physical_delivery: PhysicalDelivery | null; courier: string | null; tracking_number: string | null }): string | null {
  if (p.physical_delivery === "courier") {
    return `Physical proof by ${p.courier || "courier"}${p.tracking_number ? ` · tracking ${p.tracking_number}` : ""}`;
  }
  if (p.physical_delivery === "peniel_driver") return "Physical proof delivered by Peniel";
  return null;
}

export type SubmissionStatus = "submitted" | "accepted" | "changes_requested";

/** Badges for artwork the customer sent to Peniel. */
export function submissionPill(status: SubmissionStatus, audience: "staff" | "customer"): { label: string; style: CSSProperties } {
  switch (status) {
    case "submitted":
      return {
        label: audience === "customer" ? "With Peniel for review" : "● New from customer",
        style: audience === "customer" ? { background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" } : { background: "var(--color-accent)", color: "var(--color-bg)", fontWeight: 800 },
      };
    case "accepted":
      return { label: "✓ Accepted", style: { background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" } };
    case "changes_requested":
      return {
        label: audience === "customer" ? "↺ Peniel asked for changes" : "↺ Changes asked",
        style: { background: "var(--color-accent-100)", color: "var(--color-accent-800)", borderColor: "var(--color-accent-300)" },
      };
  }
}
