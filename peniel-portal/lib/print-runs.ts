// Printed sheets (internal only), their own process: tinplate sheets go
// (for some brands) through a base coat in the big oven first, then the
// two-unit roller printer, the UV dryer, the varnish oven and lacquer
// coating, and come off on stillages. One row = one finished
// stillage, printed with a brand's design; no order or batch number.
// Sheets are the figure that counts; crowns (702 per sheet) are only a note.
// Shared by the browser and the server; no imports.

/** Sheets on a stillage to start from; staff type the real count (usually 1,400 to 1,420). */
export const STILLAGE_SHEETS = 1_420;
/** Crowns one printed sheet makes. */
export const CROWNS_PER_SHEET = 702;
/** Most sheets on one stillage; more is surely a typo. */
export const MAX_STILLAGE_SHEETS = 10_000;
/** Most stillages saved from the print form at once. */
export const MAX_STILLAGES_AT_ONCE = 30;

/**
 * The numbers of `count` stillages from the first one: "ST-014", 3 →
 * ["ST-014", "ST-015", "ST-016"] (zero padding kept). Null when several are
 * asked for and the number doesn't end in digits.
 */
export function stillageNumbers(first: string, count: number): string[] | null {
  const no = first.trim();
  if (count <= 1) return [no];
  const m = /^(.*?)(\d+)$/.exec(no);
  if (!m) return null;
  return Array.from({ length: count }, (_, i) => `${m[1]}${String(Number(m[2]) + i).padStart(m[2].length, "0")}`);
}

/** `total` shared over `n` as evenly as whole numbers allow, the first ones taking the remainder: 10, 3 → [4, 3, 3]. */
export function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

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
  /** False while a base-coated stillage waits for the print line. */
  printed?: boolean;
  /** Sheets that went into the base coat. */
  base_sheets?: number | null;
  /** When the finished stillage went to a press (null = in printed-sheet stock). */
  to_press_at?: string | null;
  press_id?: string | null;
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

/** Passes through the big oven: the base coat (before printing, some brands), then varnish and lacquer. */
export type OvenStage = "base_coat" | "varnish" | "lacquer";

export const OVEN_STAGE_LABEL: Record<OvenStage, string> = { base_coat: "Base coat", varnish: "Varnish", lacquer: "Lacquer" };

/** The base coats a brand can need before printing. */
export type BaseCoat = "white" | "transparent";
export const BASE_COAT_LABEL: Record<BaseCoat, string> = { white: "White base coat", transparent: "Transparent base coat" };

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

export type StillageStatus = "base_oven" | "base_coated" | "printed" | "varnish_oven" | "varnished" | "lacquer_oven" | "finished" | "at_press";

export const STILLAGE_STATUS_LABEL: Record<StillageStatus, string> = {
  base_oven: "In the oven · base coat",
  base_coated: "Waiting for printing",
  printed: "Waiting for varnish",
  varnish_oven: "In the oven · varnish",
  varnished: "Waiting for lacquer",
  lacquer_oven: "In the oven · lacquer",
  finished: "Finished · in stock",
  at_press: "Sent to the press",
};

/**
 * Where a stillage is: (base coat in the oven → waiting for printing →)
 * printed → varnish in the oven → varnished → lacquer in the oven → finished.
 */
export function stillageStatus(passes: Pick<StillagePass, "stage" | "finished_at">[], printed = true, toPress: string | null = null): StillageStatus {
  if (toPress) return "at_press";
  if (!printed) {
    const base = passes.find((p) => p.stage === "base_coat");
    return base && !base.finished_at ? "base_oven" : "base_coated";
  }
  const varnish = passes.find((p) => p.stage === "varnish");
  const lacquer = passes.find((p) => p.stage === "lacquer");
  if (lacquer) return lacquer.finished_at ? "finished" : "lacquer_oven";
  if (varnish) return varnish.finished_at ? "varnished" : "varnish_oven";
  return "printed";
}

/** Good sheets left on the stillage: printed, less what the varnish and lacquer passes spoiled (the base coat came before the count). */
export const goodSheets = (printed: number, passes: (Pick<StillagePass, "sheets_spoiled"> & { stage?: OvenStage })[]): number =>
  Math.max(0, printed - passes.filter((p) => p.stage !== "base_coat").reduce((s, p) => s + Number(p.sheets_spoiled), 0));

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
