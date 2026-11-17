// Produced goods: crowns produced per order and batch, entered by hand on
// Production → Produced goods (migration 20261117000001). Their total is the
// Quantity on the batch's Certificate of Analysis. No imports: used by the
// form, the server action and the unit tests.

/** One carton (box) holds 10,000 crowns. */
export const CROWNS_PER_CARTON = 10_000;

/**
 * A typed quantity in crowns: "1,250,000" crowns, or "125" cartons. Commas
 * and spaces are ignored; cartons may have up to 4 decimals (half a carton
 * is 5,000 crowns). NaN when it isn't a whole number of crowns above zero.
 */
export function parseGoodsQuantity(raw: string, unit: "crowns" | "cartons"): number {
  const t = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  const crowns = unit === "cartons" ? Math.round(n * CROWNS_PER_CARTON * 10_000) / 10_000 : n;
  return Number.isInteger(crowns) && crowns > 0 ? crowns : NaN;
}

/** Batch numbers match without regard to case or spaces at the ends (as the certificate does). */
export const batchKey = (batch: string) => batch.trim().toLowerCase();

/**
 * What is still left to make on an order: ordered less what is already made.
 * Made = the crowns delivered before produced goods were first recorded for
 * the order (made before the portal counted them), plus every produced-goods
 * entry; never less than all that was delivered (crowns delivered were made,
 * even if their production wasn't entered). Return exchanges don't count.
 */
export function leftToMake(
  ordered: number,
  deliveries: { delivered_on: string | null; quantity: number }[],
  produced: { produced_on: string; quantity: number }[],
): { ordered: number; delivered: number; produced: number; made: number; left: number } {
  const sum = (xs: { quantity: number }[]) => xs.reduce((t, x) => t + Math.max(0, Number(x.quantity) || 0), 0);
  const delivered = sum(deliveries);
  const made_ = sum(produced);
  const first = produced.reduce<string | null>((m, p) => (m == null || p.produced_on < m ? p.produced_on : m), null);
  const before = first == null ? delivered : sum(deliveries.filter((d) => d.delivered_on == null || d.delivered_on < first));
  const made = Math.max(delivered, before + made_);
  return { ordered, delivered, produced: made_, made, left: Math.max(0, ordered - made) };
}
