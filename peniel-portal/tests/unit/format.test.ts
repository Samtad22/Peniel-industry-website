import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDateTime, formatPct, formatQty } from "../../lib/format.ts";

test("dates read `14 Oct 2026`", () => {
  assert.equal(formatDate("2026-10-14"), "14 Oct 2026");
  assert.equal(formatDate("2026-09-02"), "2 Sep 2026");
  assert.equal(formatDate(null), "—");
});

test("instants are shown in Addis Ababa time", () => {
  // 22:30 UTC on 13 Oct is 01:30 on 14 Oct in Addis Ababa (UTC+3)
  assert.equal(formatDate("2026-10-13T22:30:00Z"), "14 Oct 2026");
  assert.equal(formatDateTime("2026-10-13T22:30:00Z"), "14 Oct 2026, 01:30");
});

test("quantities read `12.0M` / `850K`", () => {
  assert.equal(formatQty(12_000_000), "12.0M");
  assert.equal(formatQty(850_000), "850K");
  assert.equal(formatQty(2_830_000), "2.8M");
  assert.equal(formatQty(999_600), "1.0M");
  assert.equal(formatQty(17_800), "18K");
  assert.equal(formatQty("640"), "640");
  assert.equal(formatQty(null), "—");
});

test("percentages", () => {
  assert.equal(formatPct(0.4), "0.40%");
  assert.equal(formatPct("2.1"), "2.10%");
});
