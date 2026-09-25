import { test } from "node:test";
import assert from "node:assert/strict";
import { cartonsLine, CROWNS_PER_CARTON, formatWastePct, parseCartons, sortingTotals, wastePct } from "../../lib/sorting.ts";

test("cartons read with their crowns (1 carton = 10,000 crowns)", () => {
  assert.equal(CROWNS_PER_CARTON, 10_000);
  assert.equal(cartonsLine(15), "15 cartons · 150K crowns");
  assert.equal(cartonsLine(1), "1 carton · 10K crowns");
  assert.equal(cartonsLine(0), "0 cartons");
  assert.equal(cartonsLine(120), "120 cartons · 1.2M crowns");
});

test("quantity is what passed, waste is scrapped: sorted = passed + waste", () => {
  // 12 cartons sorted: 10 passed, 2 scrapped.
  assert.equal(wastePct(10, 2), 16.7);
  assert.equal(formatWastePct(10, 2), "16.7%");
  assert.equal(formatWastePct(16, 0), "0.0%");
  assert.equal(formatWastePct(0, 0), "—");
  assert.equal(formatWastePct(0, 3), "100.0%");
});

test("totals over a batch's sorting reports", () => {
  const t = sortingTotals([
    { sorted_on: "2026-09-09", passed_cartons: 15, waste_cartons: 1 },
    { sorted_on: "2026-09-16", passed_cartons: 16, waste_cartons: 0 },
  ]);
  assert.deepEqual(t, { reports: 2, sorted: 32, passed: 31, waste: 1, wastePct: 3.1, lastSorted: "2026-09-16" });
  assert.deepEqual(sortingTotals([]), { reports: 0, sorted: 0, passed: 0, waste: 0, wastePct: null, lastSorted: null });
});

test("cartons must be whole numbers", () => {
  assert.equal(parseCartons("12", "Quantity"), 12);
  assert.equal(parseCartons("", "Waste"), 0);
  assert.deepEqual(parseCartons("2.5", "Waste"), { error: "Waste: enter a whole number of cartons." });
  assert.deepEqual(parseCartons("-1", "Quantity"), { error: "Quantity: enter a whole number of cartons." });
});
