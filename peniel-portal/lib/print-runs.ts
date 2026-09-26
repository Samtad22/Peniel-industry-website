// Printed sheets (coat & print line, internal only). Tinplate sheets are
// coated, lacquered and printed before the presses stamp them into crowns.
// Shared by the browser and the server; no imports.

export type PrintRun = {
  id: string;
  order_id: string;
  run_date: string;
  shift: string;
  colours: string[];
  sheets_printed: number;
  sheets_spoiled: number;
  crowns_per_sheet: number;
  coating: string | null;
  lacquer: string | null;
  oven_temp_c: number | null;
  coil_lot: string | null;
  notes: string | null;
};

/** Spoiled sheets as a share of all sheets through the line: 150 of 12,150 → 1.23. Null when nothing ran. */
export function spoiledPct(printed: number, spoiled: number): number | null {
  const all = printed + spoiled;
  return all > 0 ? Math.round((10_000 * spoiled) / all) / 100 : null;
}

/** "1.23%", or "-" when nothing ran. */
export function formatSpoiledPct(printed: number, spoiled: number): string {
  const pct = spoiledPct(printed, spoiled);
  return pct == null ? "-" : `${pct.toFixed(2)}%`;
}

/** Crowns the good sheets will yield: 12,000 sheets × 400 per sheet = 4,800,000. */
export const crownsFromSheets = (sheets: number, perSheet: number): number => Math.max(0, sheets) * Math.max(0, perSheet);

/** Totals over runs (each run can have its own crowns per sheet). */
export function printTotals(runs: Pick<PrintRun, "sheets_printed" | "sheets_spoiled" | "crowns_per_sheet" | "run_date">[]) {
  const printed = runs.reduce((s, r) => s + Number(r.sheets_printed), 0);
  const spoiled = runs.reduce((s, r) => s + Number(r.sheets_spoiled), 0);
  return {
    runs: runs.length,
    printed,
    spoiled,
    spoiledPct: spoiledPct(printed, spoiled),
    crowns: runs.reduce((s, r) => s + crownsFromSheets(Number(r.sheets_printed), Number(r.crowns_per_sheet)), 0),
    lastRun: runs.reduce<string | null>((d, r) => (!d || r.run_date > d ? r.run_date : d), null),
  };
}

/** A whole number from a form field ("12,000" → 12000), or NaN. Empty → 0. */
export function wholeNumber(raw: string): number {
  const s = raw.replace(/[,\s]/g, "");
  if (!s) return 0;
  return /^\d{1,9}$/.test(s) ? Number(s) : NaN;
}
