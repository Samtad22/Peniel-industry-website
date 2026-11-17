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
