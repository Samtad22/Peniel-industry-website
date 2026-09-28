// Printing inks (internal): one stock per ink in kg (raw_materials.ink_name),
// grams per sheet per brand (brand_ink_rates), and grams used per stillage or
// sample (print_runs.inks, sample_sheets.inks: {"<ink material id>": grams}).
// Shared by the browser and the server.
import { parseInk } from "./inks.ts";

/** An ink on the list, with a brand's grams per sheet when set. */
export type BrandInk = { materialId: string; name: string; hex: string | null; gPerSheet: number | null };

/** Grams of each ink: {"<ink material id>": grams}. */
export type InkGrams = Record<string, number>;

const trim = (n: number, digits: number) => n.toLocaleString("en-US", { maximumFractionDigits: digits });

/** 850 → "850 g", 1136 → "1.14 kg", 0.4 → "0.4 g". */
export function formatGrams(g: number): string {
  const a = Math.abs(g);
  if (a >= 1000) return `${trim(g / 1000, a >= 100_000 ? 1 : 2)} kg`;
  return `${trim(g, a < 10 ? 1 : 0)} g`;
}

/** Stock in kg, shown in g below 1 kg: 12.5 → "12.5 kg", 0.85 → "850 g". */
export const formatInkStock = (kg: number): string => formatGrams(kg * 1000);

/** An amount typed in g or kg → grams; NaN when not a number 0 or more. Empty → 0. */
export function toGrams(raw: string, unit: "g" | "kg"): number {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round((unit === "kg" ? n * 1000 : n) * 10) / 10;
}

/** Grams → the figure to show in an input, in the unit chosen: 1136, "kg" → "1.136". */
export function fromGrams(g: number, unit: "g" | "kg"): string {
  return unit === "kg" ? String(Math.round(g) / 1000) : String(Math.round(g * 10) / 10);
}

/** The unit that reads best for an amount: kg from 1 kg up. */
export const bestUnit = (g: number): "g" | "kg" => (g >= 1000 ? "kg" : "g");

/** Grams a print takes at a rate: sheets × g per sheet, to 0.1 g. */
export const inkFor = (sheets: number, gPerSheet: number | null): number => (gPerSheet && sheets > 0 ? Math.round(sheets * gPerSheet * 10) / 10 : 0);

/** A total shared over n stillages to 0.1 g, adding up exactly: 10, 3 → [3.4, 3.3, 3.3]. */
export function splitGrams(total: number, n: number): number[] {
  const tenths = Math.round(total * 10);
  const base = Math.floor(tenths / n);
  return Array.from({ length: n }, (_, i) => (base + (i < tenths - base * n ? 1 : 0)) / 10);
}

/** Each entry of an ink figure divided over n stillages. */
export function splitInks(inks: InkGrams, n: number): InkGrams[] {
  const out: InkGrams[] = Array.from({ length: n }, () => ({}));
  for (const [id, g] of Object.entries(inks)) splitGrams(g, n).forEach((x, i) => x > 0 && (out[i][id] = x));
  return out;
}

/**
 * The ink figure sent by a form (JSON {"<id>": grams}); null when it isn't
 * one. Only positive amounts are kept, ids must look like ids.
 */
export function parseInkGrams(raw: string): InkGrams | null {
  if (!raw.trim()) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: InkGrams = {};
  for (const [k, g] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[0-9a-f-]{36}$/i.test(k) || typeof g !== "number" || !Number.isFinite(g) || g < 0 || g > 10_000_000) return null;
    if (g > 0) out[k] = Math.round(g * 10) / 10;
  }
  return out;
}

/** Match a brand colour to its ink: case and spacing don't matter. */
export const inkKey = (colour: string): string => parseInk(colour).name.toUpperCase().replace(/\s+/g, " ").trim();

export type InkMaterial = { id: string; ink_name: string; active?: boolean };
export type InkRate = { brand_id: string; material_id: string; g_per_sheet: number | string };

/** A brand's colours as inks on the list (in the brand's order, once each), with its grams per sheet. */
export function brandInks(colours: string[] | null | undefined, brandId: string, inks: InkMaterial[], rates: InkRate[]): BrandInk[] {
  const byKey = new Map(inks.filter((i) => i.active !== false).map((i) => [inkKey(i.ink_name), i]));
  const seen = new Set<string>();
  const out: BrandInk[] = [];
  for (const c of colours ?? []) {
    const m = byKey.get(inkKey(c));
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    const rate = rates.find((r) => r.brand_id === brandId && r.material_id === m.id);
    out.push({ materialId: m.id, name: parseInk(c).name, hex: parseInk(c).hex, gPerSheet: rate ? Number(rate.g_per_sheet) : null });
  }
  return out;
}

/** Add up ink figures by brand: brand → ink id → grams. */
export function inkByBrand(rows: { brand: string; inks: InkGrams | null }[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    for (const [id, g] of Object.entries(r.inks ?? {})) {
      const m = out.get(r.brand) ?? new Map<string, number>();
      m.set(id, (m.get(id) ?? 0) + Number(g));
      out.set(r.brand, m);
    }
  }
  return out;
}

export const SAMPLE_PURPOSE = { colour_match: "Colour match", proof: "Proof", trial: "Trial", other: "Other" } as const;
export type SamplePurpose = keyof typeof SAMPLE_PURPOSE;
