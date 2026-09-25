// Sorting of held batches (internal only). The sorting report counts cartons
// (one carton holds 10,000 crowns): "Quantity" is the cartons that passed,
// "Waste" the cartons scrapped, so cartons sorted = passed + waste.
// Shared by the browser and the server.

export const CROWNS_PER_CARTON = 10_000;

export type SortingRecord = {
  id: string;
  inspection_id: string;
  sorted_on: string;
  passed_cartons: number;
  waste_cartons: number;
  reported_by: string | null;
  notes: string | null;
};

/** "15 cartons · 150K crowns", "1 carton · 10K crowns", "0 cartons". */
export function cartonsLine(cartons: number): string {
  const n = Math.max(0, Math.round(Number(cartons) || 0));
  if (n === 0) return "0 cartons";
  const crowns = n * CROWNS_PER_CARTON;
  const qty = crowns >= 999_500 ? `${(crowns / 1_000_000).toFixed(1)}M` : `${Math.round(crowns / 1_000)}K`;
  return `${n.toLocaleString("en-US")} carton${n === 1 ? "" : "s"} · ${qty} crowns`;
}

/** Waste as a share of the cartons sorted: 2 of 12 → 16.7. Null when nothing was sorted. */
export function wastePct(passed: number, waste: number): number | null {
  const sorted = passed + waste;
  return sorted > 0 ? Math.round((1000 * waste) / sorted) / 10 : null;
}

/** "16.7%", or "—" when nothing was sorted. */
export function formatWastePct(passed: number, waste: number): string {
  const pct = wastePct(passed, waste);
  return pct == null ? "-" : `${pct.toFixed(1)}%`;
}

/** Totals over a batch's sorting reports. */
export function sortingTotals(records: Pick<SortingRecord, "passed_cartons" | "waste_cartons" | "sorted_on">[]) {
  const passed = records.reduce((s, r) => s + Number(r.passed_cartons), 0);
  const waste = records.reduce((s, r) => s + Number(r.waste_cartons), 0);
  return {
    reports: records.length,
    sorted: passed + waste,
    passed,
    waste,
    wastePct: wastePct(passed, waste),
    lastSorted: records.reduce<string | null>((d, r) => (!d || r.sorted_on > d ? r.sorted_on : d), null),
  };
}

/** A whole number of cartons from a form field, or an error. */
export function parseCartons(raw: string, label: string): number | { error: string } {
  const s = raw.trim();
  if (!s) return 0;
  if (!/^\d{1,6}$/.test(s)) return { error: `${label}: enter a whole number of cartons.` };
  const n = Number(s);
  return n > 100_000 ? { error: `${label}: that's more than 100,000 cartons.` } : n;
}
