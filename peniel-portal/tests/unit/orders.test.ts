import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../../lib/order-timeline.ts";
import { fileExt, fileProblem, formatBytes, mimeFor, safeFileName } from "../../lib/files.ts";

const ev = (status: string, day: string, customer_reason?: string) => ({
  status: status as never,
  created_at: `2026-${day}T09:00:00Z`,
  customer_reason,
});

test("timeline: past steps, the current step, then what is still to come", () => {
  const steps = buildTimeline({
    status: "in_production",
    delivery_method: "pickup",
    due_date: "2026-10-14",
    events: [ev("submitted", "09-01"), ev("confirmed", "09-02"), ev("scheduled", "09-03"), ev("in_production", "09-10")],
  });
  assert.deepEqual(
    steps.map((s) => [s.label, s.date, s.state]),
    [
      ["Order submitted", "01 Sep", "done"],
      ["Order confirmed", "02 Sep", "done"],
      ["Scheduled", "03 Sep", "done"],
      ["In production", "10 Sep", "now"],
      ["QC inspection", "", "next"],
      ["Ready for pickup", "", "next"],
      ["Delivered", "due 14 Oct", "next"],
    ],
  );
});

test("timeline: a hold shows its customer reason; delivery orders are dispatched", () => {
  const steps = buildTimeline({
    status: "on_hold",
    delivery_method: "delivery",
    due_date: null,
    events: [ev("submitted", "09-01"), ev("confirmed", "09-02"), ev("on_hold", "09-05", "Waiting for material.")],
  });
  assert.deepEqual(steps[2], { label: "On hold", date: "05 Sep", state: "now", note: "Waiting for material." });
  assert.deepEqual(
    steps.slice(3).map((s) => s.label),
    ["Scheduled", "In production", "QC inspection", "Dispatched", "Delivered"],
  );
});

test("timeline: rejected and delivered orders have no future steps", () => {
  const rejected = buildTimeline({
    status: "rejected",
    delivery_method: "pickup",
    due_date: null,
    events: [ev("submitted", "09-01"), ev("rejected", "09-02", "Spec not supported.")],
  });
  assert.equal(rejected.length, 2);
  assert.equal(rejected[1].note, "Spec not supported.");
  const delivered = buildTimeline({
    status: "delivered",
    delivery_method: "pickup",
    due_date: "2026-09-20",
    events: [ev("submitted", "09-01"), ev("delivered", "09-20")],
  });
  assert.deepEqual(
    delivered.map((s) => s.state),
    ["done", "done"],
  );
});

test("files: allowed types, the 20 MB limit, and safe names", () => {
  assert.equal(fileProblem({ name: "PO.pdf", size: 3_800_000 }), null);
  assert.match(fileProblem({ name: "PO.pdf", size: 24.6 * 1024 * 1024 }) ?? "", /File too large \(24\.6 MB > 20 MB\)/);
  assert.match(fileProblem({ name: "macro.xlsm", size: 10 }) ?? "", /Only PDF/);
  assert.equal(mimeFor("schedule.XLSX"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(fileExt("photo.jpeg"), "JPG");
  assert.equal(formatBytes(38 * 1024), "38 KB");
  assert.equal(safeFileName("HB PO 88274 (signed).pdf"), "HB-PO-88274-signed-.pdf");
  assert.equal(safeFileName("../../etc/passwd"), "etc-passwd");
});

test("csv: quoting and formula defusing", async () => {
  const { csvLine } = await import("../../lib/csv.ts");
  assert.equal(csvLine(["PN-26-0001", 'Say "hi", ok', null, 4000000]), 'PN-26-0001,"Say ""hi"", ok",,4000000');
  assert.equal(csvLine(["=HYPERLINK(1)", "-5", "@x"]), "'=HYPERLINK(1),-5,'@x");
});

test("audit: activity log lines", async () => {
  const { describeAudit } = await import("../../lib/audit.ts");
  assert.deepEqual(
    describeAudit({
      action: "hold",
      entity: "orders",
      before: { status: "scheduled", confirmed_due_date: "2026-11-20", revised_due_date: null },
      after: { status: "on_hold", confirmed_due_date: "2026-11-20", revised_due_date: "2026-11-27", customer_reason: "Material delay" },
    }),
    { what: "Status: Scheduled → On hold", detail: "Due date: 20 Nov 2026 → 27 Nov 2026 · Customer reason: Material delay" },
  );
  assert.deepEqual(describeAudit({ action: "created", entity: "order_attachments", before: null, after: { file_name: "po.pdf" } }), {
    what: "File attached",
    detail: "po.pdf",
  });
});

test("production: projected completion from the recent pace", async () => {
  const { projectCompletion, lastDays, rejectPct } = await import("../../lib/production-math.ts");
  assert.deepEqual(lastDays("2026-09-24", 3), ["2026-09-22", "2026-09-23", "2026-09-24"]);
  const daily = [
    { date: "2026-09-21", good: 400_000 },
    { date: "2026-09-22", good: 0 },
    { date: "2026-09-23", good: 410_000 },
    { date: "2026-09-24", good: 390_000 },
  ];
  assert.deepEqual(projectCompletion(daily, 4_000_000, "2026-09-24"), { date: "2026-10-04", perDay: 400_000 });
  assert.equal(projectCompletion([], 1000, "2026-09-24"), null);
  assert.equal(projectCompletion(daily, 0, "2026-09-24"), null);
  assert.equal(rejectPct(1120, 412000), 0.27);
});

test("qc: measurement values, spec checks and trend warning", async () => {
  const { measureValue, checkMeasure, risingTrend, CROWN_HEIGHT } = await import("../../lib/qc.ts");
  assert.equal(measureValue({ crown_height_mm: [6.02, 6.01, 6.03] }, "crown_height_mm"), 6.02);
  assert.equal(measureValue({ crown_height_mm: 6.12 }, "crown_height_mm"), 6.12);
  assert.equal(measureValue({}, "crown_height_mm"), null);
  assert.equal(checkMeasure(CROWN_HEIGHT, 6.2), "high");
  assert.equal(checkMeasure(CROWN_HEIGHT, 6.0), "ok");
  assert.equal(risingTrend([1, 2, 3, 4, 5, 6, 7]), true);
  assert.equal(risingTrend([1, 2, 3, 2, 5, 6, 7]), false);
});
