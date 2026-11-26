import { test } from "node:test";
import assert from "node:assert/strict";
import { inkPerSheet, inkPerSheetFromRates, orderPlan, packOf, type PlanMaterial } from "../../lib/order-plan.ts";

const plant = { stillage_sheets: 1400, press_per_hour: 270_000, shift_hours: 8 };
const m = (name: string, unit: string, onHand: number, basis: string | null, rate: number | null): PlanMaterial => ({ id: name, name, unit, onHand, basis, rate });
const materials = [
  m("Tinplate sheet 0.23 mm", "sheets", 714_077, "sheet_in", 1),
  m("Varnish", "L", 5800, "varnish_sheet", 0.015),
  m("Adhesive lacquer", "kg", 8400, "lacquer_sheet", 0.015),
  m("White base coat", "kg", 7000, "white_base_coat_sheet", 0.0275),
  m("Transparent base coat", "kg", 1800, "transparent_base_coat_sheet", 0.00714),
  m("PVC-free liner compound", "kg", 90_600, "thousand_crowns", 0.2427),
  m("Box", "boxes", 64_105, "box", 1),
  m("Polybag", "polybags", 605_500, "box", 1),
  m("Plaster", "pcs", 150, null, null),
];
const by = (rows: ReturnType<typeof orderPlan>) => Object.fromEntries(rows.map((r) => [r.name, r]));

test("500 million crowns: what each material takes and what to order, in packs", () => {
  const rows = by(orderPlan(materials, plant, { crowns: 500_000_000, spoilagePct: 0, whiteShare: 0.5, countStock: true }));
  // 500M / 702 = 712,251 sheets.
  const sheets = 500_000_000 / 702;
  assert.ok(Math.abs(rows["Tinplate sheet 0.23 mm"].need - sheets) < 1e-6);
  assert.equal(rows["Tinplate sheet 0.23 mm"].toOrder, 0, "714,077 on hand is enough");
  assert.equal(rows["Tinplate sheet 0.23 mm"].packs, null);
  // Varnish 15 g a sheet: 10,684 kg; 5,800 on hand → 4,884 to order = 25 barrels of 200.
  assert.ok(Math.abs(rows.Varnish.need - sheets * 0.015) < 1e-6);
  assert.deepEqual(rows.Varnish.packs, { count: 25, size: 200, label: "barrels of 200 kg" });
  // Half the sheets white: 356,125 × 27.5 g = 9,793 kg; 7,000 on hand → 2,793 = 12 barrels of 250.
  assert.equal(rows["White base coat"].scope, "white");
  assert.ok(Math.abs(rows["White base coat"].need - (sheets / 2) * 0.0275) < 1e-6);
  assert.deepEqual(rows["White base coat"].packs?.count, 12);
  // PVC-free at production's figure: 500,000 × 0.2427 = 121,350 kg; 90,600 on hand → 30,750 kg = 52 units of about 600 kg.
  assert.ok(Math.abs(rows["PVC-free liner compound"].need - 121_350) < 1e-6);
  assert.equal(rows["PVC-free liner compound"].packs?.count, 52);
  // Boxes and polybags: 50,000, both enough in stock.
  assert.equal(rows.Box.need, 50_000);
  assert.equal(rows.Box.toOrder, 0);
  // No rate: not on the plan.
  assert.equal(rows.Plaster, undefined);
});

test("spoilage adds sheets (not good crowns); the coat split; the whole amount without stock", () => {
  const rows = by(orderPlan(materials, plant, { crowns: 702_000, spoilagePct: 10, whiteShare: 0.25, countStock: false }));
  assert.ok(Math.abs(rows["Tinplate sheet 0.23 mm"].need - 1100) < 1e-9);
  assert.ok(Math.abs(rows["Transparent base coat"].need - 1100 * 0.75 * 0.00714) < 1e-9);
  assert.equal(rows.Box.need, 70.2);
  assert.ok(Math.abs(rows["PVC-free liner compound"].need - 702 * 0.2427) < 1e-9);
  assert.equal(rows.Box.toOrder, rows.Box.need);
});

test("packs by name", () => {
  assert.equal(packOf("Tinplate sheet 0.23 mm")?.size, 1390);
  assert.equal(packOf("Adhesive lacquer")?.size, 200);
  assert.equal(packOf("Base coat lacquer 901")?.size, 200);
  assert.equal(packOf("Transparent base coat")?.size, 250);
  assert.equal(packOf("Box"), null);
});

test("ink a sheet takes: from printing, else an average brand", () => {
  const h = inkPerSheet([
    { sheets: 1000, inks: { a: 800, b: 200 } },
    { sheets: 1000, inks: { a: 400 } },
    { sheets: 0, inks: null },
  ]);
  assert.deepEqual([...h.entries()], [
    ["a", 0.6],
    ["b", 0.1],
  ]);
  assert.equal(inkPerSheet([]).size, 0);
  const r = inkPerSheetFromRates([
    { brand_id: "x", material_id: "a", g_per_sheet: 1 },
    { brand_id: "y", material_id: "a", g_per_sheet: "0.5" },
    { brand_id: "y", material_id: "b", g_per_sheet: 0.4 },
  ]);
  assert.deepEqual([...r.entries()], [
    ["a", 0.75],
    ["b", 0.2],
  ]);
});
