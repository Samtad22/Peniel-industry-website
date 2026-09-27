import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEodReport, eodEmailLines, type EodInput } from "../../lib/eod-report.ts";

const empty: EodInput = {
  date: "2026-09-27",
  now: "2026-09-27T17:00:00Z",
  production: [],
  printRuns: [],
  passesOut: [],
  inOven: [],
  inspections: [],
  unsignedCertificates: [],
  sorting: [],
  newOrders: [],
  statusChanges: [],
  inboxWaiting: 0,
  onHold: 0,
  dueSoon: [],
  stockAdded: [],
  stockCollected: [],
  pickupsRequested: 0,
  lowMaterials: [],
  maintenance: [],
  machinesDown: [],
  servicesOverdue: [],
};

test("a quiet day says nothing was logged and what to check", () => {
  const r = buildEodReport(empty);
  assert.equal(r.heading, "End of day report · 27 Sep 2026");
  assert.deepEqual(r.sections[0], { title: "Production", lines: ["Nothing logged."] });
  assert.ok(r.checks.includes("No production logged for shift A, B, C."));
  assert.ok(r.checks.includes("No printed sheets logged."));
  assert.equal(r.kpis[0].value, "0");
});

test("a full day: totals, per shift and order, sheets, quality, orders and the gaps", () => {
  const r = buildEodReport({
    ...empty,
    production: [
      { shift: "A", produced_qty: 1_200_000, reject_qty: 3_000, published: true, order_no: "PN-26-0001", brand: "Habesha", customer: "Habesha Brewery S.C." },
      { shift: "B", produced_qty: 800_000, reject_qty: 1_000, published: false, order_no: "PN-26-0001", brand: "Habesha", customer: "Habesha Brewery S.C." },
    ],
    printRuns: [
      { stillage_no: "ST-021", brand: "Habesha", sheets_printed: 1_410, sheets_spoiled: 12 },
      { stillage_no: "ST-022", brand: "Habesha", sheets_printed: 1_404, sheets_spoiled: 8 },
    ],
    passesOut: [{ stage: "varnish", sheets_spoiled: 3 }],
    inOven: [{ stage: "lacquer", started_at: "2026-09-27T16:20:00Z", stillage_no: "ST-021" }],
    inspections: [
      { batch_no: "B-1", order_no: "PN-26-0001", brand: "Habesha", result: "released", published: true },
      { batch_no: "B-2", order_no: "PN-26-0001", brand: "Habesha", result: "on_hold", published: false },
    ],
    unsignedCertificates: [{ batch_no: "B-1", order_no: "PN-26-0001" }],
    sorting: [{ passed_cartons: 15, waste_cartons: 1 }],
    newOrders: [{ order_no: "PN-26-0009", customer: "Dashen", brand: "Dashen", quantity: 5_000_000 }],
    statusChanges: [
      { order_no: "PN-26-0009", status: "submitted" },
      { order_no: "PN-26-0003", status: "confirmed" },
    ],
    inboxWaiting: 1,
    dueSoon: [{ order_no: "PN-26-0001", customer: "Habesha Brewery S.C.", brand: "Habesha", due: "2026-09-30", status: "in_production" }],
    stockAdded: [2_000_000],
    lowMaterials: [{ name: "Tinplate", on_hand: 10, unit: "t", reorder_level: 20 }],
  });
  const [prod, sheets, quality, orders, warehouse] = r.sections.map((s) => s.lines);
  assert.equal(prod[0], "2,000,000 crowns produced (2.0M), 4,000 camera rejects (0.20%).");
  assert.ok(prod.includes("Shift A: 1.2M crowns, 3K rejects."));
  assert.ok(prod.includes("PN-26-0001 · Habesha Brewery S.C. · Habesha: 2.0M crowns."));
  assert.equal(sheets[0], "2 stillages printed: 2,814 good sheets, 20 spoiled on the print line (0.71%).");
  assert.ok(sheets.includes("Habesha: 2 stillages (ST-021, ST-022), 2,814 sheets."));
  assert.ok(sheets.includes("Varnished: 1 stillage out of the oven, 3 sheets spoiled."));
  assert.equal(quality[0], "2 inspections: 1 released, 1 on hold.");
  assert.ok(quality.includes("Batch B-2 · PN-26-0001 · Habesha: on hold (not published)."));
  assert.ok(quality.some((l) => l.startsWith("Sorting: 15 cartons passed, 1 cartons waste (6.25%)")));
  assert.ok(orders.includes("PN-26-0009 · Dashen · Dashen: 5.0M crowns."));
  assert.ok(orders.includes("Status changes: Confirmed 1."), orders.join(" | "));
  assert.ok(orders.includes("PN-26-0001 · Habesha Brewery S.C. · Habesha: due 30 Sep 2026, In production."), orders.join(" | "));
  assert.ok(warehouse.includes("Low: Tinplate, 10 t left (reorder at 20)."));

  assert.deepEqual(r.checks, [
    "No production logged for shift C.",
    "1 production entry not published (customers don't see it yet).",
    "Stillage ST-021 still in the lacquer oven (40 min): log it out.",
    "1 inspection not published.",
    "1 certificate waiting for a signature: batch B-1 (PN-26-0001).",
    "1 order waiting in the inbox.",
  ]);
  const email = eodEmailLines(r);
  assert.ok(email[0].startsWith("Crowns produced: 2.0M (0.20% camera rejects)"));
  assert.ok(email[1].startsWith("CHECK BEFORE CLOSING THE DAY\n• No production logged for shift C."));
  assert.ok(email[2].startsWith("PRODUCTION\n• 2,000,000 crowns produced"));
});

test("maintenance: jobs and downtime on the day, machines down, open jobs and overdue services to check", () => {
  const r = buildEodReport({
    ...empty,
    maintenance: [
      { machine: "Liner 1B", kind: "Breakdown", description: "Compound nozzle blocked", minutes: 95, open: false, stopped: true },
      { machine: "Press 2", kind: "Repair", description: "Main shaft bearing", minutes: 600, open: true, stopped: true },
      { machine: "Printing machine", kind: "Cleaning", description: "Rollers cleaned", minutes: 0, open: false, stopped: false },
    ],
    machinesDown: [{ name: "Press 2", since: "2026-09-12T06:00:00Z", note: "Under repair" }],
    servicesOverdue: [{ name: "Coating oven (LPG)", days: 3 }],
  });
  const maint = r.sections.find((s) => s.title === "Maintenance")!.lines;
  assert.equal(maint[0], "3 jobs, 11 h 35 min of downtime.");
  assert.ok(maint.includes("Liner 1B · Breakdown: Compound nozzle blocked (1 h 35 min stopped)."));
  assert.ok(maint.includes("Press 2 · Repair: Main shaft bearing (10 h stopped, still going on)."));
  assert.ok(maint.includes("Printing machine · Cleaning: Rollers cleaned."));
  assert.ok(maint.includes("Down: Press 2 since 12 Sep 2026 (Under repair)."));
  assert.ok(r.checks.includes("1 maintenance job still open: Press 2. Finish it if done."));
  assert.ok(r.checks.includes("Coating oven (LPG): planned service overdue by 3 days."));
});
