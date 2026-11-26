// The next shipment: what an amount of crowns takes of each material, what
// is in stock, and what to order, in the packs it comes in (barrels,
// pallets). Used by the Calculator (/ops/calculator). Pure: shared by the
// page and the unit tests.
import { CROWNS_PER_BOX, CROWNS_PER_SHEET, PASSES_PER_STILLAGE, type Plant } from "./calculator.ts";

export type PlanMaterial = { id: string; name: string; unit: string; onHand: number; basis: string | null; rate: number | null };

export type PlanRow = {
  id: string;
  name: string;
  unit: string;
  /** Which sheets it goes on: all, or only those with that base coat. */
  scope: "all" | "white" | "transparent";
  need: number;
  onHand: number;
  /** Needed less what is in stock (0 or more); everything needed when stock isn't counted. */
  toOrder: number;
  /** What to order in its packs, rounded up: e.g. 41 barrels of 200 kg. */
  packs: { count: number; size: number; label: string } | null;
};

/** How a material comes, by its usual name: tinplate on pallets, coatings in barrels, PVC-free in units of about 600 kg. */
export function packOf(name: string): { size: number; label: string } | null {
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (k.startsWith("tinplate") || k.includes("tinfreesteel")) return { size: 1390, label: "pallets of about 1,390 sheets" };
  if (k.includes("whitebasecoat") || k.includes("basecoatwhite")) return { size: 250, label: "barrels of 250 kg" };
  if (k.includes("transparentbasecoat") || k.includes("basecoattransparent")) return { size: 250, label: "barrels of 250 kg" };
  if (k.includes("varnish") || k.includes("lacquer")) return { size: 200, label: "barrels of 200 kg" };
  if (k.includes("pvcfree") || k.includes("linercompound")) return { size: 600, label: "units of about 600 kg" };
  return null;
}

/** Sheets a material is used on, as the share of all the sheets: base coats only on their own brands' sheets. */
const scopeOf = (basis: string): PlanRow["scope"] => (basis === "white_base_coat_sheet" ? "white" : basis === "transparent_base_coat_sheet" ? "transparent" : "all");

const SHEET_BASES = new Set(["sheet_in", "sheet_printed", "base_coat_sheet", "white_base_coat_sheet", "transparent_base_coat_sheet", "varnish_sheet", "lacquer_sheet"]);

/**
 * What `crowns` good crowns take of each material with a usage rate.
 * `spoilagePct` adds sheets (and what goes on them) for spoilage; good
 * crowns themselves (PVC-free, boxes, polybags) aren't increased. `whiteShare`
 * (0 to 1) is the part of the sheets that get the white base coat; the rest
 * get the transparent (one coat a sheet). `countStock`: take what is in
 * stock off the order.
 */
export function orderPlan(
  materials: PlanMaterial[],
  plant: Plant,
  opts: { crowns: number; spoilagePct: number; whiteShare: number; countStock: boolean },
): PlanRow[] {
  const crowns = Math.max(0, opts.crowns || 0);
  const sheets = (crowns / CROWNS_PER_SHEET) * (1 + Math.max(0, opts.spoilagePct || 0) / 100);
  const stillages = plant.stillage_sheets > 0 ? sheets / plant.stillage_sheets : 0;
  const white = Math.min(1, Math.max(0, opts.whiteShare));
  const rows: PlanRow[] = [];
  for (const m of materials) {
    const rate = Number(m.rate ?? 0);
    if (!m.basis || !(rate > 0)) continue;
    const scope = scopeOf(m.basis);
    const share = scope === "white" ? white : scope === "transparent" ? 1 - white : 1;
    let need: number;
    if (SHEET_BASES.has(m.basis)) need = sheets * share * rate;
    else if (m.basis === "oven_pass") need = stillages * PASSES_PER_STILLAGE * rate;
    else if (m.basis === "thousand_crowns") need = (crowns / 1000) * rate;
    else if (m.basis === "box") need = (crowns / CROWNS_PER_BOX) * rate;
    else continue;
    const onHand = Math.max(0, Number(m.onHand) || 0);
    const toOrder = Math.max(0, opts.countStock ? need - onHand : need);
    const pack = packOf(m.name);
    rows.push({
      id: m.id,
      name: m.name,
      unit: m.unit,
      scope,
      need,
      onHand,
      toOrder,
      packs: pack && toOrder > 0 ? { count: Math.ceil(toOrder / pack.size - 1e-9), size: pack.size, label: pack.label } : null,
    });
  }
  return rows;
}

export type InkUseRecord = { sheets: number; inks: Record<string, number> | null };

/**
 * Grams of each ink a sheet took on average, from what printing used (sheets
 * through the printer, good and spoiled): ink id → grams per sheet.
 */
export function inkPerSheet(records: InkUseRecord[]): Map<string, number> {
  let sheets = 0;
  const grams = new Map<string, number>();
  for (const r of records) {
    sheets += Math.max(0, Number(r.sheets) || 0);
    for (const [id, g] of Object.entries(r.inks ?? {})) grams.set(id, (grams.get(id) ?? 0) + Math.max(0, Number(g) || 0));
  }
  const out = new Map<string, number>();
  if (sheets <= 0) return out;
  for (const [id, g] of grams) if (g > 0) out.set(id, g / sheets);
  return out;
}

/**
 * Without printing history: an average brand. For each ink, its grams per
 * sheet summed over the brands that have ink rates, over the number of
 * those brands.
 */
export function inkPerSheetFromRates(rates: { brand_id: string; material_id: string; g_per_sheet: number | string }[]): Map<string, number> {
  const brands = new Set(rates.filter((r) => Number(r.g_per_sheet) > 0).map((r) => r.brand_id));
  const out = new Map<string, number>();
  if (brands.size === 0) return out;
  for (const r of rates) {
    const g = Number(r.g_per_sheet);
    if (g > 0) out.set(r.material_id, (out.get(r.material_id) ?? 0) + g / brands.size);
  }
  return out;
}
