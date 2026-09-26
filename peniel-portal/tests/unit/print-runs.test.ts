import { test } from "node:test";
import assert from "node:assert/strict";
import { crownsFromSheets, formatSpoiledPct, printTotals, spoiledPct, wholeNumber } from "../../lib/print-runs.ts";

test("spoiled sheets as a share of all sheets through the line", () => {
  assert.equal(spoiledPct(12_000, 150), 1.23);
  assert.equal(formatSpoiledPct(12_000, 150), "1.23%");
  assert.equal(formatSpoiledPct(0, 0), "-");
  assert.equal(spoiledPct(0, 20), 100);
});

test("good sheets × crowns per sheet = crowns the sheets will yield", () => {
  assert.equal(crownsFromSheets(12_000, 400), 4_800_000);
  assert.equal(crownsFromSheets(-5, 400), 0);
  const t = printTotals([
    { run_date: "2026-09-25", sheets_printed: 12_000, sheets_spoiled: 150, crowns_per_sheet: 400 },
    { run_date: "2026-09-26", sheets_printed: 10_000, sheets_spoiled: 50, crowns_per_sheet: 380 },
  ]);
  assert.deepEqual(t, { runs: 2, printed: 22_000, spoiled: 200, spoiledPct: 0.9, crowns: 8_600_000, lastRun: "2026-09-26" });
});

test("whole numbers from a form field", () => {
  assert.equal(wholeNumber("12,000"), 12_000);
  assert.equal(wholeNumber(""), 0);
  assert.ok(Number.isNaN(wholeNumber("1.5")));
  assert.ok(Number.isNaN(wholeNumber("-3")));
});
