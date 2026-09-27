import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthReport, monthBounds, monthEmailLines, monthName, previousMonth, type MonthInput } from "../../lib/month-report.ts";

const empty: MonthInput = {
  month: "2026-09",
  production: [],
  stillages: [],
  sheetStock: 0,
  inspections: [],
  sorting: [],
  newOrders: [],
  completedOrders: 0,
  onHoldNow: 0,
  maintenance: [],
  materials: [],
};

test("months: names, bounds and the one before", () => {
  assert.equal(monthName("2026-09"), "September 2026");
  assert.deepEqual(monthBounds("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(previousMonth("2026-10-01"), "2026-09");
  assert.equal(previousMonth("2027-01-01"), "2026-12");
});

test("a month in one page", () => {
  const r = buildMonthReport({
    ...empty,
    production: [
      { line: "Press 1 · Liner 1A", brand: "Habesha", customer: "Habesha Brewery S.C.", produced: 1_000_000, rejects: 2_000, date: "2026-09-01" },
      { line: "Press 1 · Liner 1B", brand: "Habesha", customer: "Habesha Brewery S.C.", produced: 500_000, rejects: 1_000, date: "2026-09-02" },
    ],
    stillages: [
      { printed: true, good: 1400, spoiled: 10, baseCoated: true, toPress: true },
      { printed: true, good: 1410, spoiled: 0, baseCoated: false, toPress: false },
    ],
    sheetStock: 1,
    inspections: [{ result: "released" }, { result: "on_hold" }],
    newOrders: [{ quantity: 5_000_000, customer: "Dashen" }],
    completedOrders: 2,
    maintenance: [
      { machine: "Press 2", kind: "Repair", minutes: 600, stopped: true },
      { machine: "Liner 1B", kind: "Breakdown", minutes: 90, stopped: true },
      { machine: "UV dryer", kind: "Cleaning", minutes: 30, stopped: false },
    ],
    materials: [{ name: "Lacquer", unit: "L", used: 140.5, received: 400, onHand: 780 }],
  });
  assert.equal(r.heading, "Monthly summary · September 2026");
  const [prod, sheets, quality, orders, maint, mats] = r.sections.map((s) => s.lines);
  assert.equal(prod[0], "1,500,000 crowns produced (1.5M) on 2 days, 3,000 camera rejects (0.20%).");
  assert.ok(prod.includes("Press 1 · Liner 1A: 1.0M crowns."));
  assert.equal(sheets[0], "2 stillages printed: 2,810 good sheets, 10 spoiled (0.35%).");
  assert.ok(sheets.includes("1 stillage sent to the presses."));
  assert.equal(quality[0], "2 inspections: 1 released, 1 on hold.");
  assert.equal(orders[0], "1 new order for 5.0M crowns.");
  assert.equal(maint[0], "3 jobs, 1 breakdown, 11.5 h of downtime.");
  assert.ok(maint.includes("Press 2: 10.0 h down."));
  assert.equal(mats[0], "1 material used or received.");
  assert.equal(mats[1], "Lacquer: 140.5 L used, 400 L received, 780 L on hand now.");
  assert.equal(
    r.summary,
    "The presses made 1.5M crowns on 2 working days (about 750K a day), with 0.20% camera rejects. 2 stillages were printed (2,810 good sheets). Quality inspected 2 batches: 1 released, 1 on hold. 1 new order came in for 5.0M crowns, and 2 orders were completed. Machines were stopped for 11.5 h in total (1 breakdown).",
  );
  assert.ok(monthEmailLines(r)[0].startsWith("SUMMARY\nThe presses made 1.5M"));
  assert.ok(monthEmailLines(r)[2].startsWith("PRODUCTION\n• 1,500,000"));
});
