// The admin's calculator (/ops/calculator): unit conversion, what stillages
// and materials make, and what an amount of crowns consumes. Uses the plant
// settings and the materials' usage rates (lib/materials.ts). Pure: shared by
// the browser and tests. Internal only.

import type { UseBasis } from "./materials.ts";

export const CROWNS_PER_SHEET = 702;
export const CROWNS_PER_BOX = 10_000;
/** Oven passes a stillage takes as a rule: varnish and lacquer (a base coat adds one). */
export const PASSES_PER_STILLAGE = 2;

export type Plant = { stillage_sheets: number; press_per_hour: number; shift_hours: number };

/** Weight units, in kg. */
export const WEIGHT = { t: 1000, kg: 1, g: 0.001 } as const;
export type WeightUnit = keyof typeof WEIGHT;

/** 1.5 t → 1,500 kg. */
export const convertWeight = (value: number, from: WeightUnit, to: WeightUnit): number => (value * WEIGHT[from]) / WEIGHT[to];

/** A typed number: commas and spaces allowed ("1,500.5"); NaN when not a number. Empty → 0. */
export function num(raw: string): number {
  const s = raw.trim().replace(/[\s,]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** What an amount of crowns means on the plant. */
export type Yield = {
  sheets: number;
  stillages: number;
  crowns: number;
  boxes: number;
  /** Hours on one press with both liners running. */
  pressHours: number;
  /** Hours on one liner. */
  linerHours: number;
  /** Shifts on one press, both liners. */
  shifts: number;
};

export function yieldOfCrowns(crowns: number, p: Plant): Yield {
  const c = Math.max(0, crowns);
  const sheets = c / CROWNS_PER_SHEET;
  const pressHours = p.press_per_hour > 0 ? c / p.press_per_hour : 0;
  return {
    crowns: c,
    sheets,
    stillages: p.stillage_sheets > 0 ? sheets / p.stillage_sheets : 0,
    boxes: c / CROWNS_PER_BOX,
    pressHours,
    linerHours: pressHours * 2,
    shifts: p.shift_hours > 0 ? pressHours / p.shift_hours : 0,
  };
}

export const yieldOfSheets = (sheets: number, p: Plant): Yield => yieldOfCrowns(Math.max(0, sheets) * CROWNS_PER_SHEET, p);
export const yieldOfStillages = (stillages: number, p: Plant, sheetsEach = p.stillage_sheets): Yield => yieldOfSheets(Math.max(0, stillages) * sheetsEach, p);

/** A material's usage: per sheet (of a step), per oven pass, per 1,000 crowns, per box, or ink grams per sheet. */
export type Basis = UseBasis | "ink";

const SHEET_BASES: Basis[] = ["sheet_in", "sheet_printed", "base_coat_sheet", "varnish_sheet", "lacquer_sheet", "ink"];

/**
 * What an amount of a material makes, from its rate (in the material's unit
 * per basis; for inks, grams per sheet and the amount in grams). Null when
 * the rate is missing.
 */
export function yieldOfMaterial(amount: number, basis: Basis, rate: number, p: Plant): Yield | null {
  if (!(rate > 0) || !(amount >= 0)) return null;
  const units = amount / rate;
  if (SHEET_BASES.includes(basis)) return yieldOfSheets(units, p);
  if (basis === "oven_pass") return yieldOfStillages(units / PASSES_PER_STILLAGE, p);
  if (basis === "thousand_crowns") return yieldOfCrowns(units * 1000, p);
  if (basis === "box") return yieldOfCrowns(units * CROWNS_PER_BOX, p);
  return null;
}

/** How much of a material an amount of crowns takes (in its unit; inks in grams). */
export function needFor(crowns: number, basis: Basis, rate: number, p: Plant): number {
  const y = yieldOfCrowns(crowns, p);
  if (!(rate > 0)) return 0;
  if (SHEET_BASES.includes(basis)) return y.sheets * rate;
  if (basis === "oven_pass") return y.stillages * PASSES_PER_STILLAGE * rate;
  if (basis === "thousand_crowns") return (y.crowns / 1000) * rate;
  if (basis === "box") return y.boxes * rate;
  return 0;
}

/** Hours as "3 h 36 min", or days past 48 h: "4.2 days (100 h)". */
export function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0 min";
  if (h >= 48) return `${(h / 24).toLocaleString("en-US", { maximumFractionDigits: 1 })} days (${Math.round(h).toLocaleString("en-US")} h)`;
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  if (whole === 0) return `${min} min`;
  return min === 60 ? `${whole + 1} h` : `${whole} h${min ? ` ${min} min` : ""}`;
}

/** A figure to read: whole from 100 up, else up to 2 decimals. */
export const fmt = (n: number, digits = 2): string =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : digits }) : "-";

/** An amount in a material's unit, with tonnes for big kg figures: 1,500 kg → "1,500 kg (1.5 t)". */
export function formatAmount(v: number, unit: string): string {
  const u = unit.toLowerCase();
  if (u === "kg" && Math.abs(v) >= 1000) return `${fmt(v)} kg (${fmt(v / 1000)} t)`;
  if (u === "kg" && Math.abs(v) > 0 && Math.abs(v) < 1) return `${fmt(v * 1000)} g`;
  return `${fmt(v)} ${unit}`;
}
