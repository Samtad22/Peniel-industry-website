// Printed sheets (internal only), their own process: tinplate sheets go
// through the two-unit roller printer, the UV dryer, the varnish oven and
// lacquer coating, and come off on stillages. One row = one finished
// stillage, printed with a brand's design; no order or batch number.
// Sheets are the figure that counts; crowns (702 per sheet) are only a note.
// Shared by the browser and the server; no imports.

/** Sheets on a stillage to start from; staff type the real count (usually 1,400 to 1,420). */
export const STILLAGE_SHEETS = 1_410;
/** Crowns one printed sheet makes. */
export const CROWNS_PER_SHEET = 702;

export type PrintRun = {
  id: string;
  brand_id: string;
  stillage_no: string | null;
  run_date: string;
  shift: string;
  colours: string[];
  sheets_printed: number;
  sheets_spoiled: number;
  crowns_per_sheet: number;
  varnish: string | null;
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

/** Totals over stillages. */
export function printTotals(runs: Pick<PrintRun, "sheets_printed" | "sheets_spoiled" | "crowns_per_sheet" | "run_date">[]) {
  const printed = runs.reduce((s, r) => s + Number(r.sheets_printed), 0);
  const spoiled = runs.reduce((s, r) => s + Number(r.sheets_spoiled), 0);
  return {
    stillages: runs.length,
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

/** Minutes a stillage usually stays in the oven for varnish or lacquer. */
export const OVEN_MINUTES = 30;

export type OvenStage = "varnish" | "lacquer";

/** One pass of a stillage through the oven. `finished_at` null = still in the oven. */
export type StillagePass = {
  id: string;
  print_run_id: string;
  stage: OvenStage;
  material: string | null;
  oven_temp_c: number | null;
  started_at: string;
  finished_at: string | null;
  sheets_spoiled: number;
  notes: string | null;
};

export type StillageStatus = "printed" | "varnish_oven" | "varnished" | "lacquer_oven" | "finished";

export const STILLAGE_STATUS_LABEL: Record<StillageStatus, string> = {
  printed: "Waiting for varnish",
  varnish_oven: "In the oven · varnish",
  varnished: "Waiting for lacquer",
  lacquer_oven: "In the oven · lacquer",
  finished: "Finished",
};

/** Where a stillage is: printed → varnish in the oven → varnished → lacquer in the oven → finished. */
export function stillageStatus(passes: Pick<StillagePass, "stage" | "finished_at">[]): StillageStatus {
  const varnish = passes.find((p) => p.stage === "varnish");
  const lacquer = passes.find((p) => p.stage === "lacquer");
  if (lacquer) return lacquer.finished_at ? "finished" : "lacquer_oven";
  if (varnish) return varnish.finished_at ? "varnished" : "varnish_oven";
  return "printed";
}

/** Good sheets left on the stillage: printed, less what the oven passes spoiled. */
export const goodSheets = (printed: number, passes: Pick<StillagePass, "sheets_spoiled">[]): number =>
  Math.max(0, printed - passes.reduce((s, p) => s + Number(p.sheets_spoiled), 0));

/** Whole minutes between two times (or since `from`, up to `to`). */
export const minutesBetween = (from: string, to: string | Date): number => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));

/** The next stillage number after the ones used: "ST-021" → "ST-022", "7" → "8"; "ST-001" when none. */
export function nextStillageNo(used: (string | null)[]): string {
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const u of used) {
    const m = /^(.*?)(\d+)$/.exec((u ?? "").trim());
    if (!m) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1], n, width: m[2].length };
  }
  if (!best) return "ST-001";
  return `${best.prefix}${String(best.n + 1).padStart(best.width, "0")}`;
}
