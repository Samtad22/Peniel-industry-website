import type { CSSProperties } from "react";

export type OrderStatus =
  | "submitted"
  | "confirmed"
  | "awaiting_approval"
  | "scheduled"
  | "in_production"
  | "quality_check"
  | "ready_for_pickup"
  | "dispatched"
  | "delivered"
  | "on_hold"
  | "rejected";

/** Order of the statuses as an order moves forward (on_hold / rejected last). */
export const ORDER_STATUSES: OrderStatus[] = [
  "submitted",
  "confirmed",
  "awaiting_approval",
  "scheduled",
  "in_production",
  "quality_check",
  "ready_for_pickup",
  "dispatched",
  "delivered",
  "on_hold",
  "rejected",
];

/** Statuses that count as open (not finished, not rejected). */
export const OPEN_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  (s) => s !== "delivered" && s !== "rejected",
);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: "Submitted",
  confirmed: "Confirmed",
  awaiting_approval: "Awaiting approval",
  scheduled: "Scheduled",
  in_production: "In production",
  quality_check: "QC inspection",
  ready_for_pickup: "Ready for pickup",
  dispatched: "Dispatched",
  delivered: "Delivered",
  on_hold: "On hold",
  rejected: "Rejected",
};

/** Badge text, as the design shows it to each side. */
export function statusBadgeLabel(status: OrderStatus, audience: "staff" | "customer"): string {
  switch (status) {
    case "awaiting_approval":
      return audience === "customer" ? "● Awaiting your approval" : "● Awaiting customer approval";
    case "delivered":
      return "✓ Delivered";
    case "on_hold":
      return "❚❚ On hold";
    case "rejected":
      return "× Rejected";
    default:
      return ORDER_STATUS_LABELS[status];
  }
}

/** Status wording without the badge's leading symbol, e.g. "Awaiting your approval". */
export function statusText(status: OrderStatus, audience: "staff" | "customer"): string {
  return statusBadgeLabel(status, audience).replace(/^[●✓❚×\s]+/, "");
}

// Badge look — from the design's pill styles (Peniel Ops Staff Portal, `PS`).
export const PILL_BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  lineHeight: "16px",
  padding: "3px 10px",
  whiteSpace: "nowrap",
  letterSpacing: ".02em",
  border: "1px solid transparent",
};

export const ORDER_STATUS_PILL: Record<OrderStatus, CSSProperties> = {
  submitted: { borderColor: "var(--color-text)" },
  // Not in the design's list; styled like its "Under review".
  confirmed: { background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" },
  awaiting_approval: { background: "var(--color-accent)", color: "var(--color-bg)", fontWeight: 800 },
  scheduled: { border: "1px dashed var(--color-neutral-600)", color: "var(--color-neutral-800)" },
  in_production: {
    background: "var(--color-accent-100)",
    color: "var(--color-accent-800)",
    borderColor: "var(--color-accent-300)",
  },
  quality_check: { borderColor: "var(--color-accent)", color: "var(--color-accent-700)" },
  ready_for_pickup: { background: "var(--color-text)", color: "var(--color-bg)" },
  dispatched: { background: "var(--color-neutral-300)", color: "var(--color-text)" },
  delivered: { color: "var(--color-neutral-700)", paddingLeft: 0 },
  on_hold: { background: "var(--color-accent-800)", color: "var(--color-bg)" },
  // Not in the design's list; an outlined deep-red badge.
  rejected: { borderColor: "var(--color-accent-800)", color: "var(--color-accent-800)" },
};

export type UserStatus = "active" | "invited" | "deactivated";

export const USER_STATUS_PILL: Record<UserStatus, { label: string; style: CSSProperties }> = {
  active: { label: "Active", style: { background: "var(--color-neutral-200)", color: "var(--color-neutral-800)" } },
  invited: { label: "Invited", style: { border: "1px dashed var(--color-neutral-600)", color: "var(--color-neutral-800)" } },
  deactivated: {
    label: "Deactivated",
    style: { color: "var(--color-neutral-600)", paddingLeft: 0, textDecoration: "line-through" },
  },
};
