import { test } from "node:test";
import assert from "node:assert/strict";
import { batchKey, parseGoodsQuantity } from "../../lib/produced-goods.ts";

test("quantities in crowns or cartons of 10,000", () => {
  assert.equal(parseGoodsQuantity("1,250,000", "crowns"), 1_250_000);
  assert.equal(parseGoodsQuantity(" 1 250 000 ", "crowns"), 1_250_000);
  assert.equal(parseGoodsQuantity("125", "cartons"), 1_250_000);
  assert.equal(parseGoodsQuantity("12.5", "cartons"), 125_000);
  assert.equal(parseGoodsQuantity("0.0001", "cartons"), 1);
  assert.ok(Number.isNaN(parseGoodsQuantity("12.5", "crowns")), "half a crown");
  assert.ok(Number.isNaN(parseGoodsQuantity("0", "crowns")));
  assert.ok(Number.isNaN(parseGoodsQuantity("-5", "crowns")));
  assert.ok(Number.isNaN(parseGoodsQuantity("abc", "cartons")));
  assert.ok(Number.isNaN(parseGoodsQuantity("", "crowns")));
});

test("batch numbers match without regard to case or end spaces", () => {
  assert.equal(batchKey(" b-0142 "), batchKey("B-0142"));
});
