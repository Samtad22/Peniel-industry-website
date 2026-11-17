import { test } from "node:test";
import assert from "node:assert/strict";
import { coatShareFrom, dateIn, daysLabel, stockCapacity } from "../../lib/stock-capacity.ts";

const plant = { stillage_sheets: 1420, press_per_hour: 270_000, shift_hours: 8 };
const m = (o: Partial<Parameters<typeof stockCapacity>[0][number]> & { name: string }) => ({
  id: o.name,
  unit: "kg",
  on_hand: 0,
  reorder_level: null,
  use_basis: null,
  use_rate: null,
  ...o,
});

test("what each material's stock makes; the one that runs out first sets the figure", () => {
  const c = stockCapacity(
    [
      // 1,000 kg at 0.2 kg per 1,000 crowns = 5,000,000 crowns.
      m({ name: "PVC-free liner compound", on_hand: 1000, use_basis: "thousand_crowns", use_rate: 0.2, reorder_level: 400 }),
      // 10,000 sheets x 702 = 7,020,000 crowns.
      m({ name: "Tinplate", unit: "sheets", on_hand: 10_000, use_basis: "sheet_in", use_rate: 1 }),
      // 450 boxes x 10,000 = 4,500,000 crowns: runs out first.
      m({ name: "Box", unit: "boxes", on_hand: 450, use_basis: "box", use_rate: 1 }),
      m({ name: "White base coat", on_hand: 25.15, use_basis: "white_base_coat_sheet", use_rate: 0.02515 }),
      m({ name: "Thinner", on_hand: 1800 }),
    ],
    plant,
    1_000_000,
  );
  assert.deepEqual(c.rows.map((r) => [r.name, Math.round(r.crowns)]), [
    ["Box", 4_500_000],
    ["PVC-free liner compound", 5_000_000],
    ["Tinplate", 7_020_000],
  ]);
  assert.equal(c.bottleneck?.name, "Box");
  // Base coats only for their brands: apart, and never the bottleneck.
  assert.deepEqual(c.coatRows.map((r) => [r.name, Math.round(r.crowns), r.scope]), [["White base coat", 702_000, "white_base_coat"]]);
  assert.deepEqual(c.noRate.map((r) => r.name), ["Thinner"]);
  // 1,000,000 crowns a day: PVC 0.2 kg a day → 5 days to empty, 3 to the reorder level (400 kg).
  const pvc = c.rows.find((r) => r.name === "PVC-free liner compound")!;
  assert.equal(pvc.perDayFrom, "pace");
  assert.equal(Math.round(pvc.perDay! * 1000) / 1000, 200);
  assert.equal(pvc.daysToEmpty, 5);
  assert.equal(pvc.daysToReorder, 3);
  // No pace for a base coat without its own recent use.
  assert.equal(c.coatRows[0].daysToEmpty, null);
});

test("the plant's pace wins for materials in every crown; own use for base coats, or with no pace", () => {
  const varnish = m({ name: "Varnish", on_hand: 300, use_basis: "varnish_sheet", use_rate: 0.015, used_recently: 90 });
  // 702,000 crowns a day = 1,000 sheets a day = 15 kg a day: 20 days.
  const planned = stockCapacity([varnish], plant, 702_000, 30);
  assert.equal(planned.rows[0].perDayFrom, "pace");
  assert.equal(planned.rows[0].daysToEmpty, 20);
  // No pace: its own use over 30 days (3 a day).
  const c = stockCapacity([varnish], plant, null, 30);
  assert.equal(c.rows[0].perDayFrom, "use");
  assert.equal(c.rows[0].perDay, 3);
  assert.equal(c.rows[0].daysToEmpty, 100);
  // A base coat: never its own use; its share of the pace (here all of it).
  const coat = stockCapacity([m({ name: "White base coat", on_hand: 100, use_basis: "white_base_coat_sheet", use_rate: 0.02515, used_recently: 300 })], plant, 702_000, 30, { white: 1, transparent: 0 });
  assert.equal(coat.coatRows[0].perDayFrom, "share");
  // 1,000 sheets a day x 25.15 g = 25.15 kg a day.
  assert.ok(Math.abs(coat.coatRows[0].daysToEmpty! - 100 / 25.15) < 1e-9);
  // Below the reorder level already: 0 days.
  const low = stockCapacity([m({ name: "Box", on_hand: 10, reorder_level: 50, use_basis: "box", use_rate: 1 })], plant, 100_000);
  assert.equal(low.rows[0].daysToReorder, 0);
});

test("no pace: crowns but no days", () => {
  const c = stockCapacity([m({ name: "Box", on_hand: 10, use_basis: "box", use_rate: 1 })], plant, null);
  assert.equal(c.rows[0].crowns, 100_000);
  assert.equal(c.rows[0].daysToEmpty, null);
});

test("days and dates", () => {
  assert.equal(daysLabel(null), "-");
  assert.equal(daysLabel(0.4), "today");
  assert.equal(daysLabel(1), "1 day");
  assert.equal(daysLabel(12.7), "12 days");
  assert.equal(daysLabel(95), "about 3 months");
  assert.equal(dateIn("2026-11-17", 14.9), "2026-12-01");
  assert.equal(dateIn("2026-11-17", null), null);
});

test("the dashboard's eight materials, found by their usual names", async () => {
  const { pickDashboardMaterials } = await import("../../lib/stock-capacity.ts");
  const list = [
    m({ name: "Varnish", unit: "L", on_hand: 6000, use_basis: "varnish_sheet", use_rate: 0.015 }),
    m({ name: "Lacquer", unit: "L", on_hand: 0 }),
    m({ name: "Adhesive lacquer", on_hand: 6000, use_basis: "lacquer_sheet", use_rate: 0.015 }),
    m({ name: "White base coat", on_hand: 7500, use_basis: "white_base_coat_sheet", use_rate: 0.02515 }),
    m({ name: "PVC-free liner compound", on_hand: 52000, use_basis: "thousand_crowns", use_rate: 0.1818 }),
    m({ name: "Tinplate sheet 0.23 mm", unit: "sheets", on_hand: 403_508, use_basis: "sheet_in", use_rate: 1 }),
    m({ name: "Box", unit: "boxes", on_hand: 6000, use_basis: "box", use_rate: 1 }),
    m({ name: "Polybag", unit: "polybags", on_hand: 6000, use_basis: "box", use_rate: 1 }),
    m({ name: "Thinner", on_hand: 1800 }),
    m({ name: "CTP plate developer", unit: "L", on_hand: 960, use_basis: "sheet_printed", use_rate: 0.00023 }),
  ];
  const { picked, missing } = pickDashboardMaterials(list);
  // Lacquer: the one with a usage rate. Thinner and CTP developer: not shown.
  assert.deepEqual(picked.map((x) => x.name), ["Varnish", "Adhesive lacquer", "White base coat", "PVC-free liner compound", "Tinplate sheet 0.23 mm", "Polybag", "Box"]);
  assert.deepEqual(missing, ["Transparent base coat"]);
});

test("each sheet gets one base coat: each coat lasts at its share of the pace", () => {
  // Printed: 60,000 sheets of white-coat brands (e.g. Dashen, Heineken), 40,000 of transparent (Coca-Cola, Habesha).
  const share = coatShareFrom([
    { coat: "white", crowns: 60_000 },
    { coat: "transparent", crowns: 40_000 },
    { coat: null, crowns: 0 },
    { coat: "white", crowns: -5 },
  ]);
  assert.deepEqual(share, { white: 0.6, transparent: 0.4 });
  assert.equal(coatShareFrom([]), null);
  const c = stockCapacity(
    [
      // 7,500 kg at 27.5 g a sheet = 272,727 sheets.
      m({ name: "White base coat", on_hand: 7500, use_basis: "white_base_coat_sheet", use_rate: 0.0275, used_recently: 1 }),
      // 1,800 kg at 7.14 g a sheet = 252,101 sheets.
      m({ name: "Transparent base coat", on_hand: 1800, use_basis: "transparent_base_coat_sheet", use_rate: 0.00714 }),
    ],
    plant,
    // 702,000 crowns a day = 1,000 sheets a day.
    702_000,
    30,
    share,
  );
  const by = Object.fromEntries(c.coatRows.map((r) => [r.name, r]));
  // White: 600 sheets a day x 27.5 g = 16.5 kg a day; 7,500 / 16.5 = 454.5 days.
  assert.equal(by["White base coat"].perDayFrom, "share");
  assert.equal(by["White base coat"].share, 0.6);
  assert.ok(Math.abs(by["White base coat"].perDay! - 16.5) < 1e-9);
  assert.ok(Math.abs(by["White base coat"].daysToEmpty! - 7500 / 16.5) < 1e-9);
  // Transparent: 400 sheets a day x 7.14 g = 2.856 kg a day.
  assert.ok(Math.abs(by["Transparent base coat"].perDay! - 2.856) < 1e-9);
  // Still apart from the materials in every crown.
  assert.equal(c.rows.length, 0);
  // Nothing printed: no date (a trickle of logged use would give hundreds of years).
  const none = stockCapacity([m({ name: "White base coat", on_hand: 7500, use_basis: "white_base_coat_sheet", use_rate: 0.0275, used_recently: 30 })], plant, 702_000, 30, null);
  assert.equal(none.coatRows[0].perDay, null);
  assert.equal(none.coatRows[0].daysToEmpty, null);
});
