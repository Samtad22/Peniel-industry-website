import { test } from "node:test";
import assert from "node:assert/strict";
import { cartonsLine, CROWNS_PER_CARTON, parseCartons, sortingTotals } from "../../lib/sorting.ts";

test("cartons read with their crowns (1 carton = 10,000 crowns)", () => {
  assert.equal(CROWNS_PER_CARTON, 10_000);
  assert.equal(cartonsLine(15), "15 cartons · 150K crowns");
  assert.equal(cartonsLine(1), "1 carton · 10K crowns");
  assert.equal(cartonsLine(0), "0 cartons");
  assert.equal(cartonsLine(120), "120 cartons · 1.2M crowns");
});

test("totals over a batch's sorting reports", () => {
  const t = sortingTotals([
    { sorted_on: "2026-09-09", sorted_cartons: 15, waste_cartons: 1 },
    { sorted_on: "2026-09-16", sorted_cartons: 16, waste_cartons: 0 },
  ]);
  assert.deepEqual(t, { reports: 2, sorted: 31, waste: 1, lastSorted: "2026-09-16" });
  assert.deepEqual(sortingTotals([]), { reports: 0, sorted: 0, waste: 0, lastSorted: null });
});

test("cartons must be whole numbers", () => {
  assert.equal(parseCartons("12", "Quantity"), 12);
  assert.equal(parseCartons("", "Waste"), 0);
  assert.deepEqual(parseCartons("2.5", "Waste"), { error: "Waste: enter a whole number of cartons." });
  assert.deepEqual(parseCartons("-1", "Quantity"), { error: "Quantity: enter a whole number of cartons." });
});
