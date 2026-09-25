import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDateTime, formatPct, formatQty } from "../../lib/format.ts";

test("dates read `14 Oct 2026`", () => {
  assert.equal(formatDate("2026-10-14"), "14 Oct 2026");
  assert.equal(formatDate("2026-09-02"), "2 Sep 2026");
  assert.equal(formatDate(null), "-");
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
  assert.equal(formatQty(null), "-");
});

test("percentages", () => {
  assert.equal(formatPct(0.4), "0.40%");
  assert.equal(formatPct("2.1"), "2.10%");
});

test("short dates, clock line and greeting use Addis Ababa time", async () => {
  const { formatDayMonth, formatNowLine, greeting, timeAgo, addisDateISO } = await import("../../lib/format.ts");
  const now = new Date("2026-09-23T13:52:00Z"); // 16:52 in Addis Ababa
  assert.equal(formatDayMonth("2026-11-20"), "20 Nov");
  assert.equal(formatDayMonth("2026-09-02"), "02 Sep");
  assert.equal(formatNowLine(now), "Wed 23 Sep 2026 · 16:52 EAT");
  assert.equal(greeting(now), "Good afternoon");
  assert.equal(greeting(new Date("2026-09-23T05:00:00Z")), "Good morning");
  assert.equal(greeting(new Date("2026-09-23T15:30:00Z")), "Good evening");
  assert.equal(timeAgo("2026-09-23T13:40:00Z", now), "12 min ago");
  assert.equal(timeAgo("2026-09-23T11:52:00Z", now), "2 h ago");
  assert.equal(timeAgo("2026-09-22T11:52:00Z", now), "1 d ago");
  assert.equal(addisDateISO(new Date("2026-09-23T22:30:00Z")), "2026-09-24");
  assert.equal(addisDateISO(now, 7), "2026-09-30");
});

test("status wording: QC inspection, customer vs staff approval text", async () => {
  const { statusText, statusBadgeLabel } = await import("../../lib/order-status.ts");
  assert.equal(statusText("quality_check", "customer"), "QC inspection");
  assert.equal(statusText("awaiting_approval", "customer"), "Awaiting your approval");
  assert.equal(statusBadgeLabel("awaiting_approval", "staff"), "● Awaiting customer approval");
  assert.equal(statusText("on_hold", "customer"), "On hold");
  assert.equal(statusBadgeLabel("delivered", "customer"), "✓ Delivered");
});
