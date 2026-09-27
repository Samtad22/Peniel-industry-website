import { test } from "node:test";
import assert from "node:assert/strict";
import { csvName, toCsv } from "../../lib/csv.ts";

test("CSV for Excel: BOM, quoting, no formulas, numbers as numbers", () => {
  const out = toCsv([
    ["Order", "Customer", "Crowns", "Note"],
    ["PN-26-0001", "Habesha Brewery S.C.", 1200000, 'Said "urgent", call back'],
    ["PN-26-0002", "=HYPERLINK(1)", -5, null],
    ["x", "line\nbreak", 1.5, true],
  ]);
  assert.ok(out.startsWith("﻿Order,Customer,Crowns,Note\r\n"));
  assert.ok(out.includes('PN-26-0001,Habesha Brewery S.C.,1200000,"Said ""urgent"", call back"\r\n'));
  assert.ok(out.includes("PN-26-0002,'=HYPERLINK(1),-5,\r\n"), out);
  assert.ok(out.includes('x,"line\nbreak",1.5,true\r\n'));
  assert.equal(csvName("production", "2026-09-01", "2026-09-30"), "peniel-production-2026-09-01-to-2026-09-30.csv");
});
