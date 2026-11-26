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
