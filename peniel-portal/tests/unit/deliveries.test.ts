import { test } from "node:test";
import assert from "node:assert/strict";
import { cartonsLabel, deliveryTotals, parseDeliveryQuantity, sortDeliveries } from "../../lib/deliveries.ts";

test("delivered, remaining and return exchanges", () => {
  const t = deliveryTotals(38_000_000, [
    { kind: "delivery", quantity: 3_000_000 },
    { kind: "delivery", quantity: 8_380_000 },
    { kind: "return_exchange", quantity: 1_160_000 },
  ]);
  assert.deepEqual({ ...t, pct: Math.round(t.pct * 10) / 10 }, { ordered: 38_000_000, delivered: 11_380_000, returnExchange: 1_160_000, remaining: 26_620_000, over: 0, pct: 29.9 });
  const over = deliveryTotals(100, [{ kind: "delivery", quantity: 120 }]);
  assert.equal(over.remaining, 0);
  assert.equal(over.over, 20);
  assert.equal(over.pct, 100);
});

test("quantities in cartons or crowns", () => {
  assert.equal(parseDeliveryQuantity("190", "cartons"), 1_900_000);
  assert.equal(parseDeliveryQuantity("61.5", "cartons"), 615_000);
  assert.equal(parseDeliveryQuantity("1,900,000", "crowns"), 1_900_000);
  assert.ok(Number.isNaN(parseDeliveryQuantity("0", "cartons")));
  assert.ok(Number.isNaN(parseDeliveryQuantity("1.5", "crowns")));
  assert.equal(cartonsLabel(1_900_000), "190 cartons");
  assert.equal(cartonsLabel(10_000), "1 carton");
  assert.equal(cartonsLabel(615_000), "61.5 cartons");
});

test("newest first, undated last", () => {
  const rows = sortDeliveries([
    { delivered_on: "2026-03-10", do_no: "1649" },
    { delivered_on: null, do_no: null },
    { delivered_on: "2026-11-16", do_no: "35" },
    { delivered_on: "2026-03-10", do_no: "1650" },
  ]);
  assert.deepEqual(rows.map((r) => r.do_no), ["35", "1650", "1649", null]);
});
