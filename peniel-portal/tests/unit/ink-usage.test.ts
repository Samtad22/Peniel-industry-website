import { test } from "node:test";
import assert from "node:assert/strict";
import { bestUnit, brandInks, formatGrams, formatInkStock, fromGrams, inkByBrand, inkFor, inkKey, parseInkGrams, splitGrams, splitInks, toGrams } from "../../lib/ink-usage.ts";

const RED = "11111111-1111-4111-8111-111111111111";
const BLACK = "22222222-2222-4222-8222-222222222222";

test("grams and kilograms read naturally", () => {
  assert.equal(formatGrams(850), "850 g");
  assert.equal(formatGrams(1136), "1.14 kg");
  assert.equal(formatGrams(0.4), "0.4 g");
  assert.equal(formatGrams(250_000), "250 kg");
  assert.equal(formatInkStock(12.5), "12.5 kg");
  assert.equal(formatInkStock(0.85), "850 g");
  assert.equal(formatInkStock(-1.136), "-1.14 kg");
});

test("typed in g or kg, stored in grams", () => {
  assert.equal(toGrams("850", "g"), 850);
  assert.equal(toGrams("1,2", "kg"), 1200);
  assert.equal(toGrams(" 1.136 ", "kg"), 1136);
  assert.equal(toGrams("", "g"), 0);
  assert.ok(Number.isNaN(toGrams("abc", "g")));
  assert.ok(Number.isNaN(toGrams("-5", "kg")));
  assert.equal(fromGrams(1136, "kg"), "1.136");
  assert.equal(fromGrams(850.25, "g"), "850.3");
  assert.equal(bestUnit(999), "g");
  assert.equal(bestUnit(1000), "kg");
});

test("ink from the rate: sheets × grams per sheet", () => {
  assert.equal(inkFor(1420, 0.8), 1136);
  assert.equal(inkFor(4260 + 30, 0.8), 3432);
  assert.equal(inkFor(1420, null), 0);
  assert.equal(inkFor(0, 0.8), 0);
});

test("ink shared over several stillages adds up exactly", () => {
  assert.deepEqual(splitGrams(10, 3), [3.4, 3.3, 3.3]);
  assert.deepEqual(splitGrams(3432, 3), [1144, 1144, 1144]);
  assert.equal(splitGrams(1000.1, 7).reduce((a, b) => a + b, 0).toFixed(1), "1000.1");
  assert.deepEqual(splitInks({ [RED]: 3432, [BLACK]: 0.1 }, 2), [{ [RED]: 1716, [BLACK]: 0.1 }, { [RED]: 1716 }]);
});

test("the form's ink figure is checked", () => {
  assert.deepEqual(parseInkGrams(""), {});
  assert.deepEqual(parseInkGrams(JSON.stringify({ [RED]: 1136.04, [BLACK]: 0 })), { [RED]: 1136 });
  assert.equal(parseInkGrams("invalid"), null);
  assert.equal(parseInkGrams("[1]"), null);
  assert.equal(parseInkGrams(JSON.stringify({ nope: 5 })), null);
  assert.equal(parseInkGrams(JSON.stringify({ [RED]: -1 })), null);
  assert.equal(parseInkGrams(JSON.stringify({ [RED]: "5" })), null);
});

test("a brand's colours matched to the inks on the list, with its rates", () => {
  assert.equal(inkKey("pantone  485 c #DA291C"), "PANTONE 485 C");
  const inks = [
    { id: RED, ink_name: "PANTONE 485 C" },
    { id: BLACK, ink_name: "Black", active: false },
  ];
  const rates = [
    { brand_id: "b1", material_id: RED, g_per_sheet: "0.8" },
    { brand_id: "b2", material_id: RED, g_per_sheet: 1.2 },
  ];
  assert.deepEqual(brandInks(["PANTONE 485 C #DA291C", "Black", "#FFCD00", "pantone 485 c"], "b1", inks, rates), [
    { materialId: RED, name: "PANTONE 485 C", hex: "#DA291C", gPerSheet: 0.8 },
  ]);
  assert.equal(brandInks(["PANTONE 485 C"], "b3", inks, rates)[0].gPerSheet, null);
});

test("ink used, added up by brand", () => {
  const by = inkByBrand([
    { brand: "Habesha", inks: { [RED]: 1000 } },
    { brand: "Habesha", inks: { [RED]: 136, [BLACK]: 50 } },
    { brand: "Feta", inks: null },
  ]);
  assert.equal(by.get("Habesha")?.get(RED), 1136);
  assert.equal(by.get("Habesha")?.get(BLACK), 50);
  assert.equal(by.has("Feta"), false);
});
