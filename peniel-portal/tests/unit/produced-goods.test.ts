import { test } from "node:test";
import assert from "node:assert/strict";
import { batchKey, parseGoodsQuantity, leftToMake } from "../../lib/produced-goods.ts";

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

test("left to make: what remains on the order, not the whole PO", () => {
  const D = (delivered_on: string | null, quantity: number) => ({ delivered_on, quantity });
  const P = (produced_on: string, quantity: number) => ({ produced_on, quantity });
  // 70.39M ordered, 50M delivered before the portal counted production: 20.39M left.
  const before = [D(null, 10_000_000), D("2026-10-01", 40_000_000)];
  assert.deepEqual(leftToMake(70_390_000, before, []), { ordered: 70_390_000, delivered: 50_000_000, produced: 0, made: 50_000_000, left: 20_390_000 });
  // 2M produced since: 18.39M left.
  assert.equal(leftToMake(70_390_000, before, [P("2026-11-17", 2_000_000)]).left, 18_390_000);
  // Those 2M then delivered: still 18.39M left (not taken off twice).
  assert.equal(leftToMake(70_390_000, [...before, D("2026-11-20", 2_000_000)], [P("2026-11-17", 2_000_000)]).left, 18_390_000);
  // Delivered more than was entered as produced: what was delivered was made.
  assert.equal(leftToMake(70_390_000, [...before, D("2026-11-20", 5_000_000)], [P("2026-11-17", 2_000_000)]).left, 15_390_000);
  // Never below zero.
  assert.equal(leftToMake(1_000_000, [D("2026-10-01", 1_200_000)], []).left, 0);
});
