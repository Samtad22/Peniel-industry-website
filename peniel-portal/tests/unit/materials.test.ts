import { test } from "node:test";
import assert from "node:assert/strict";
import { describeUse, parseRate } from "../../lib/materials.ts";

test("usage rates read naturally, and are optional", () => {
  assert.equal(describeUse({ unit: "kg", use_basis: "thousand_crowns", use_rate: 0.5 }), "Uses 0.5 kg per 1,000 crowns");
  assert.equal(describeUse({ unit: "sheets", use_basis: "sheet_in", use_rate: "1" }), "Uses 1 sheets per sheet into the line");
  assert.equal(describeUse({ unit: "kg", use_basis: null, use_rate: 2 }), null);
  assert.equal(describeUse({ unit: "kg", use_basis: "oven_pass", use_rate: 0 }), null);
  assert.equal(parseRate(""), null);
  assert.equal(parseRate("0,25"), 0.25);
  assert.ok(Number.isNaN(parseRate("-1")));
  assert.ok(Number.isNaN(parseRate("abc")));
});

test("wastage on top of the rate", async () => {
  const { effectiveRate, describeUse, parseWastePct } = await import("../../lib/materials.ts");
  assert.equal(effectiveRate(0.173, 10), 0.1903);
  assert.equal(effectiveRate("0.173", null), 0.173);
  assert.equal(effectiveRate(null, 10), null);
  assert.equal(effectiveRate(0.173, 500), 0.346);
  assert.equal(describeUse({ unit: "kg", use_basis: "thousand_crowns", use_rate: 0.173, waste_pct: 10 }), "Uses 0.173 kg per 1,000 crowns + 10% wastage");
  assert.equal(describeUse({ unit: "kg", use_basis: "thousand_crowns", use_rate: 0.173 }), "Uses 0.173 kg per 1,000 crowns");
  assert.equal(parseWastePct(""), 0);
  assert.equal(parseWastePct("10%"), 10);
  assert.equal(parseWastePct("7,5"), 7.5);
  assert.ok(Number.isNaN(parseWastePct("150")));
});
