import type { CSSProperties } from "react";

export type StockStatus = "available" | "reserved" | "on_hold";
export type PickupStatus = "requested" | "confirmed" | "rescheduled" | "collected";

export const STOCK_PILL: Record<StockStatus, { label: string; style: CSSProperties }> = {
  available: { label: "Available for pickup", style: { background: "var(--color-text)", color: "var(--color-bg)" } },
  reserved: { label: "Reserved", style: { borderColor: "var(--color-text)" } },
  on_hold: { label: "❚❚ On hold (QC)", style: { background: "var(--color-accent-800)", color: "var(--color-bg)" } },
};

export const PICKUP_PILL: Record<PickupStatus, { label: string; style: CSSProperties }> = {
  requested: { label: "Requested", style: { background: "var(--color-accent)", color: "var(--color-bg)", fontWeight: 800 } },
  confirmed: { label: "✓ Confirmed", style: { background: "var(--color-text)", color: "var(--color-bg)" } },
  rescheduled: { label: "New time proposed", style: { border: "1px dashed var(--color-neutral-600)", color: "var(--color-neutral-800)" } },
  collected: { label: "Collected", style: { color: "var(--color-neutral-700)", paddingLeft: 0 } },
};

/** A `datetime-local` value entered in Addis Ababa, as an ISO timestamp. */
export function addisLocalToIso(v: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+03:00` : null;
}

/** Now in Addis Ababa as a `datetime-local` value (`2026-09-24T16:40`). */
export function addisLocalNow(): string {
  return new Date(new Date().getTime() + 3 * 3600_000).toISOString().slice(0, 16);
}
