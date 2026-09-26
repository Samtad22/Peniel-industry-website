import { test } from "node:test";
import assert from "node:assert/strict";
import { CROWNS_PER_SHEET, crownsFromSheets, formatSpoiledPct, printTotals, spoiledPct, STILLAGE_SHEETS, wholeNumber } from "../../lib/print-runs.ts";

test("spoiled sheets as a share of all sheets through the line", () => {
  assert.equal(spoiledPct(12_000, 150), 1.23);
  assert.equal(formatSpoiledPct(12_000, 150), "1.23%");
  assert.equal(formatSpoiledPct(0, 0), "-");
  assert.equal(spoiledPct(0, 20), 100);
});

test("a stillage of about 1,410 sheets, 702 crowns a sheet (a note, sheets are what count)", () => {
  assert.equal(STILLAGE_SHEETS, 1_410);
  assert.equal(CROWNS_PER_SHEET, 702);
  assert.equal(crownsFromSheets(1_410, CROWNS_PER_SHEET), 989_820);
  assert.equal(crownsFromSheets(-5, 702), 0);
  const t = printTotals([
    { run_date: "2026-09-25", sheets_printed: 1_410, sheets_spoiled: 12, crowns_per_sheet: 702 },
    { run_date: "2026-09-26", sheets_printed: 1_402, sheets_spoiled: 8, crowns_per_sheet: 702 },
  ]);
  assert.deepEqual(t, { stillages: 2, printed: 2_812, spoiled: 20, spoiledPct: 0.71, crowns: 1_974_024, lastRun: "2026-09-26" });
});

test("whole numbers from a form field", () => {
  assert.equal(wholeNumber("12,000"), 12_000);
  assert.equal(wholeNumber(""), 0);
  assert.ok(Number.isNaN(wholeNumber("1.5")));
  assert.ok(Number.isNaN(wholeNumber("-3")));
});
