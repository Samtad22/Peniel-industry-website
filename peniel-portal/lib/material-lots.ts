// Lots (deliveries) of a raw material, with production and expiry dates
// (migration 20261121000001). Stock is used oldest first, so what is on hand
// is taken to be the newest lots: the stock on hand is shared out over the
// lots from the newest delivery back. What is left over (more on hand than
// the lots recorded) has no dates. No imports: used by pages and unit tests.

export type MaterialLot = {
  id: string;
  received_on: string | null;
  quantity: number;
  produced_on: string | null;
  expires_on: string | null;
  lot_no: string | null;
  notes: string | null;
};

export type LotInStock = MaterialLot & { inStock: number };

export type LotStock = {
  /** The lots with stock left, newest first, and how much of each is on hand. */
  lots: LotInStock[];
  /** On hand with no lot to date it. */
  undated: number;
  /** On hand past its expiry date. */
  expired: number;
  /** The earliest expiry date of the stock on hand that hasn't expired, and how much. */
  next: { date: string; quantity: number } | null;
  /** The earliest expiry date among the expired stock on hand. */
  expiredSince: string | null;
};

/** The order deliveries came in: received date, else production date, else the order recorded. */
const when = (l: MaterialLot) => l.received_on ?? l.produced_on ?? "";

/**
 * What of `onHand` is in which lot (newest first), what has expired by
 * `todayIso` (YYYY-MM-DD) and what expires next.
 */
export function lotStock(onHand: number, lots: MaterialLot[], todayIso: string): LotStock {
  let left = Math.max(0, Number(onHand) || 0);
  const newest = [...lots].sort((a, b) => when(b).localeCompare(when(a)));
  const inStock: LotInStock[] = [];
  for (const l of newest) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, Number(l.quantity) || 0));
    if (take > 0) inStock.push({ ...l, inStock: round(take) });
    left -= take;
  }
  let expired = 0;
  let expiredSince: string | null = null;
  const upcoming = new Map<string, number>();
  for (const l of inStock) {
    if (!l.expires_on) continue;
    if (l.expires_on < todayIso) {
      expired += l.inStock;
      if (!expiredSince || l.expires_on < expiredSince) expiredSince = l.expires_on;
    } else upcoming.set(l.expires_on, (upcoming.get(l.expires_on) ?? 0) + l.inStock);
  }
  const nextDate = [...upcoming.keys()].sort()[0];
  return {
    lots: inStock,
    undated: round(left),
    expired: round(expired),
    next: nextDate ? { date: nextDate, quantity: round(upcoming.get(nextDate)!) } : null,
    expiredSince,
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Expiring within this many days is flagged. */
export const EXPIRY_WARN_DAYS = 60;

/** How a material stands on expiry: "expired" (some on hand), "soon" (within the warning days), "ok", or "undated" (no expiry on file). */
export function expiryState(s: LotStock, todayIso: string): "expired" | "soon" | "ok" | "undated" {
  if (s.expired > 0) return "expired";
  if (!s.next) return "undated";
  return daysBetween(todayIso, s.next.date) <= EXPIRY_WARN_DAYS ? "soon" : "ok";
}
