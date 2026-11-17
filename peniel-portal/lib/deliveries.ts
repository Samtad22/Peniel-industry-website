// Deliveries of an order (migration 20261117000007): each DO, delivered and
// remaining. A "return exchange" (RE) is crowns delivered before, returned,
// sorted and sent back: listed, not counted again. No imports: shared by the
// pages, the forms, the server actions and the unit tests.

export type DeliveryKind = "delivery" | "return_exchange";

export const DELIVERY_KIND: Record<DeliveryKind, string> = {
  delivery: "Delivery",
  return_exchange: "Return exchange (RE)",
};

export type Delivery = {
  id: string;
  order_id: string;
  kind: DeliveryKind;
  do_no: string | null;
  delivered_on: string | null;
  quantity: number;
  notes?: string | null;
};

/** One carton holds 10,000 crowns. */
export const CROWNS_PER_CARTON = 10_000;

/** Delivered (deliveries only), returned and sent back (RE), remaining (never below 0), over-delivered. */
export function deliveryTotals(ordered: number, rows: Pick<Delivery, "kind" | "quantity">[]) {
  const delivered = rows.filter((r) => r.kind === "delivery").reduce((t, r) => t + Number(r.quantity), 0);
  const returnExchange = rows.filter((r) => r.kind === "return_exchange").reduce((t, r) => t + Number(r.quantity), 0);
  return {
    ordered,
    delivered,
    returnExchange,
    remaining: Math.max(0, ordered - delivered),
    over: Math.max(0, delivered - ordered),
    pct: ordered > 0 ? Math.min(100, (delivered / ordered) * 100) : 0,
  };
}

/** 1,250,000 → "125 cartons"; 1,255,000 → "125.5 cartons". */
export function cartonsLabel(crowns: number): string {
  const c = Math.round((crowns / CROWNS_PER_CARTON) * 10) / 10;
  return `${c.toLocaleString("en-US")} carton${c === 1 ? "" : "s"}`;
}

/** Newest first; those without a date (an opening figure) last. */
export function sortDeliveries<T extends Pick<Delivery, "delivered_on" | "do_no">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.delivered_on ?? "").localeCompare(a.delivered_on ?? "") || (b.do_no ?? "").localeCompare(a.do_no ?? "", undefined, { numeric: true }));
}

/**
 * A typed quantity in crowns: "1,250,000" crowns, or "125" cartons (up to 4
 * decimals). NaN when not a whole number of crowns above zero.
 */
export function parseDeliveryQuantity(raw: string, unit: "crowns" | "cartons"): number {
  const t = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = unit === "cartons" ? Math.round(Number(t) * CROWNS_PER_CARTON * 10_000) / 10_000 : Number(t);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}
