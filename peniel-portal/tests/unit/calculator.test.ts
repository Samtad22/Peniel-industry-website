import { test } from "node:test";
import assert from "node:assert/strict";
import { convertWeight, formatAmount, formatHours, needFor, num, yieldOfCrowns, yieldOfMaterial, yieldOfStillages } from "../../lib/calculator.ts";

const plant = { stillage_sheets: 1420, press_per_hour: 270_000, shift_hours: 8 };

test("metric tons, kg and grams", () => {
  assert.equal(convertWeight(1.5, "t", "kg"), 1500);
  assert.equal(convertWeight(600, "kg", "t"), 0.6);
  assert.equal(convertWeight(2, "kg", "g"), 2000);
  assert.equal(convertWeight(850, "g", "kg"), 0.85);
  assert.equal(num("1,500.5"), 1500.5);
  assert.equal(num(""), 0);
  assert.ok(Number.isNaN(num("abc")));
});

test("one stillage: 1,420 sheets × 702 = 996,840 crowns, about 3 h 41 min on a press", () => {
  const y = yieldOfStillages(1, plant);
  assert.equal(y.sheets, 1420);
  assert.equal(y.crowns, 996_840);
  assert.equal(formatHours(y.pressHours), "3 h 42 min");
  assert.equal(formatHours(y.linerHours), "7 h 23 min");
  assert.equal(Math.round(y.boxes * 10) / 10, 99.7);
  assert.equal(yieldOfStillages(2, plant, 1400).sheets, 2800);
});

test("what a material makes, by its usage basis", () => {
  // 600 L of varnish at 0.01 L a sheet varnished: 60,000 sheets.
  const v = yieldOfMaterial(600, "varnish_sheet", 0.01, plant)!;
  assert.equal(Math.round(v.sheets), 60_000);
  assert.equal(Math.round(v.crowns), 42_120_000);
  // Ink: 1 kg (1,000 g) at 0.8 g a sheet.
  assert.equal(yieldOfMaterial(1000, "ink", 0.8, plant)!.sheets, 1250);
  // Liner compound: 0.45 kg per 1,000 crowns.
  assert.equal(Math.round(yieldOfMaterial(450, "thousand_crowns", 0.45, plant)!.crowns), 1_000_000);
  // Boxes: 1 a box of 10,000.
  assert.equal(yieldOfMaterial(100, "box", 1, plant)!.crowns, 1_000_000);
  // Oven: 2 passes a stillage.
  assert.equal(yieldOfMaterial(10, "oven_pass", 1, plant)!.stillages, 5);
  assert.equal(yieldOfMaterial(600, "varnish_sheet", 0, plant), null);
});

test("what an amount of crowns consumes", () => {
  const crowns = 996_840; // one stillage
  assert.equal(Math.round(needFor(crowns, "varnish_sheet", 0.01, plant) * 100) / 100, 14.2);
  assert.equal(Math.round(needFor(crowns, "ink", 0.8, plant)), 1136);
  assert.equal(Math.round(needFor(crowns, "oven_pass", 1, plant)), 2);
  assert.equal(Math.round(needFor(1_000_000, "thousand_crowns", 0.45, plant)), 450);
  assert.equal(needFor(1_000_000, "box", 1, plant), 100);
  assert.equal(yieldOfCrowns(-5, plant).crowns, 0);
});

test("figures read naturally", () => {
  assert.equal(formatHours(0.5), "30 min");
  assert.equal(formatHours(100), "4.2 days (100 h)");
  assert.equal(formatAmount(1500, "kg"), "1,500 kg (1.5 t)");
  assert.equal(formatAmount(0.25, "kg"), "250 g");
  assert.equal(formatAmount(14.2, "L"), "14.2 L");
});
