// The end-of-day report: what was logged in the plant on one day (Addis Ababa
// time), put together from the portal's own records. No AI or paid service:
// the same sections go to the admins by email every evening and show on
// /ops/reports/eod (printable as a PDF). INTERNAL: staff only, never customers.
//
// Pure (no server imports) so it can be unit-tested; lib/eod-data.ts loads the rows.

import { formatDate, formatQty } from "./format.ts";
import { formatGrams } from "./ink-usage.ts";
import { ORDER_STATUS_LABELS, type OrderStatus } from "./order-status.ts";

const SHIFTS = ["A", "B", "C"] as const;
const CROWNS_PER_CARTON = 10_000;

export type EodInput = {
  /** The day, `YYYY-MM-DD` in Addis Ababa. */
  date: string;
  /** Now, to time stillages still in the oven. */
  now: string;
  production: { shift: string; produced_qty: number; reject_qty: number; published: boolean; order_no: string; brand: string; customer: string }[];
  printRuns: { stillage_no: string | null; brand: string; sheets_printed: number; sheets_spoiled: number }[];
  /** Oven passes that came out on the day. */
  passesOut: { stage: "base_coat" | "varnish" | "lacquer"; sheets_spoiled: number }[];
  /** Stillages sent to the presses on the day. */
  toPress: number;
  /** Stillages used up at the presses on the day. */
  usedUp?: number;
  /** Finished stillages in printed-sheet stock now. */
  sheetStock: number;
  /** Base-coated stillages with no brand yet (base-coated stock) now. */
  coatedStock?: number;
  /** Sample sheets logged on the day. */
  samples?: { brand: string; sheets: number }[];
  /** Ink used on the day (stillages printed and samples), per ink. */
  inkUsed?: { name: string; grams: number }[];
  /** Oven passes with no "out" time yet, whatever day they went in. */
  inOven: { stage: "base_coat" | "varnish" | "lacquer"; started_at: string; stillage_no: string | null }[];
  inspections: { batch_no: string; order_no: string; brand: string; result: "released" | "on_hold" | null; published: boolean }[];
  /** Released, published certificates with no signature yet. */
  unsignedCertificates: { batch_no: string; order_no: string }[];
  sorting: { passed_cartons: number; waste_cartons: number }[];
  newOrders: { order_no: string; customer: string; brand: string; quantity: number }[];
  statusChanges: { order_no: string; status: OrderStatus }[];
  /** Orders waiting in the inbox (submitted, not confirmed). */
  inboxWaiting: number;
  onHold: number;
  /** Open orders due within the next 7 days. */
  dueSoon: { order_no: string; customer: string; brand: string; due: string; status: OrderStatus }[];
  stockAdded: number[];
  stockCollected: number[];
  pickupsRequested: number;
  lowMaterials: { name: string; on_hand: number; unit: string; reorder_level: number }[];
  /** Maintenance jobs that ran on the day; minutes = downtime within the day. */
  maintenance: { machine: string; kind: string; description: string; minutes: number; open: boolean; stopped: boolean }[];
  /** Machines down now. */
  machinesDown: { name: string; since: string; note: string | null }[];
  /** Planned services past their date. */
  servicesOverdue: { name: string; days: number }[];
};

export type EodSection = { title: string; lines: string[] };
export type EodReport = {
  date: string;
  heading: string;
  /** A few sentences on the day, from the same figures. */
  summary: string;
  /** Headline numbers. */
  kpis: { label: string; value: string; sub?: string }[];
  /** What still looks missing or open before the day is closed. */
  checks: string[];
  sections: EodSection[];
};

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const pct = (part: number, whole: number) => (whole > 0 ? `${((100 * part) / whole).toFixed(2)}%` : "-");
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
const duration = (minutes: number) => (minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${Math.round(minutes % 60)} min` : ""}`);

/** Group rows by a key, keeping first-seen order. */
function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()];
}

export function buildEodReport(d: EodInput): EodReport {
  // ---- Production (crowns off the presses) ----
  const produced = sum(d.production.map((p) => p.produced_qty));
  const rejects = sum(d.production.map((p) => p.reject_qty));
  const production: string[] = [];
  if (d.production.length === 0) production.push("Nothing logged.");
  else {
    production.push(`${n(produced)} crowns produced (${formatQty(produced)}), ${n(rejects)} camera rejects (${pct(rejects, produced)}).`);
    for (const s of SHIFTS) {
      const rows = d.production.filter((p) => p.shift === s);
      if (rows.length) production.push(`Shift ${s}: ${formatQty(sum(rows.map((p) => p.produced_qty)))} crowns, ${formatQty(sum(rows.map((p) => p.reject_qty)))} rejects.`);
    }
    for (const [order, rows] of groupBy(d.production, (p) => p.order_no)) {
      production.push(`${order} · ${rows[0].customer} · ${rows[0].brand}: ${formatQty(sum(rows.map((p) => p.produced_qty)))} crowns.`);
    }
  }

  // ---- Printed sheets ----
  const printed = sum(d.printRuns.map((r) => r.sheets_printed));
  const printSpoiled = sum(d.printRuns.map((r) => r.sheets_spoiled));
  const sheets: string[] = [];
  if (d.printRuns.length === 0 && d.passesOut.length === 0) sheets.push("Nothing logged.");
  if (d.printRuns.length) {
    sheets.push(`${plural(d.printRuns.length, "stillage")} printed: ${n(printed)} good sheets, ${n(printSpoiled)} spoiled on the print line (${pct(printSpoiled, printed + printSpoiled)}).`);
    for (const [brand, rows] of groupBy(d.printRuns, (r) => r.brand)) {
      const nos = rows.map((r) => r.stillage_no).filter(Boolean);
      sheets.push(`${brand}: ${plural(rows.length, "stillage")}${nos.length ? ` (${nos.join(", ")})` : ""}, ${n(sum(rows.map((r) => r.sheets_printed)))} sheets.`);
    }
  }
  for (const stage of ["base_coat", "varnish", "lacquer"] as const) {
    const out = d.passesOut.filter((p) => p.stage === stage);
    if (out.length) sheets.push(`${stage === "base_coat" ? "Base-coated" : stage === "varnish" ? "Varnished" : "Lacquered"}: ${plural(out.length, "stillage")} out of the oven, ${n(sum(out.map((p) => p.sheets_spoiled)))} sheets spoiled.`);
  }

  if (d.samples?.length) {
    const brands = [...new Set(d.samples.map((s) => s.brand).filter(Boolean))];
    sheets.push(`Sample sheets: ${plural(sum(d.samples.map((s) => s.sheets)), "sheet")}${brands.length ? ` (${brands.join(", ")})` : ""}.`);
  }
  if (d.inkUsed?.length) sheets.push(`Ink used: ${d.inkUsed.map((i) => `${i.name} ${formatGrams(i.grams)}`).join(", ")}.`);
  if (d.toPress) sheets.push(`Sent to the presses: ${plural(d.toPress, "stillage")}.`);
  if (d.usedUp) sheets.push(`Used up at the presses: ${plural(d.usedUp, "stillage")}.`);
  sheets.push(`In stock now: ${plural(d.sheetStock, "finished stillage")}.`);
  if (d.coatedStock) sheets.push(`Base-coated stock (brand later): ${plural(d.coatedStock, "stillage")}.`);

  // ---- Quality ----
  const released = d.inspections.filter((i) => i.result === "released").length;
  const held = d.inspections.filter((i) => i.result === "on_hold").length;
  const passed = sum(d.sorting.map((s) => s.passed_cartons));
  const waste = sum(d.sorting.map((s) => s.waste_cartons));
  const quality: string[] = [];
  if (d.inspections.length === 0) quality.push("No inspections logged.");
  else {
    quality.push(`${plural(d.inspections.length, "inspection")}: ${n(released)} released, ${n(held)} on hold${d.inspections.length - released - held ? `, ${n(d.inspections.length - released - held)} undecided` : ""}.`);
    for (const i of d.inspections) {
      quality.push(`Batch ${i.batch_no} · ${i.order_no} · ${i.brand}: ${i.result === "released" ? "released" : i.result === "on_hold" ? "on hold" : "no decision yet"}${i.published ? "" : " (not published)"}.`);
    }
  }
  if (d.sorting.length) {
    quality.push(`Sorting: ${n(passed)} cartons passed, ${n(waste)} cartons waste (${pct(waste, passed + waste)}); 1 carton = ${n(CROWNS_PER_CARTON)} crowns.`);
  }

  // ---- Orders ----
  const orders: string[] = [];
  orders.push(d.newOrders.length ? `${plural(d.newOrders.length, "new order")}:` : "No new orders.");
  for (const o of d.newOrders) orders.push(`${o.order_no} · ${o.customer} · ${o.brand}: ${formatQty(o.quantity)} crowns.`);
  const changes = groupBy(
    d.statusChanges.filter((c) => c.status !== "submitted"),
    (c) => c.status,
  );
  if (changes.length) orders.push(`Status changes: ${changes.map(([s, rows]) => `${ORDER_STATUS_LABELS[s as OrderStatus] ?? s} ${rows.length}`).join(", ")}.`);
  if (d.onHold) orders.push(`${plural(d.onHold, "order")} on hold.`);
  if (d.dueSoon.length) {
    orders.push(`Due in the next 7 days:`);
    for (const o of d.dueSoon) orders.push(`${o.order_no} · ${o.customer} · ${o.brand}: due ${formatDate(o.due)}, ${ORDER_STATUS_LABELS[o.status] ?? o.status}.`);
  }

  // ---- Warehouse and materials ----
  const warehouse: string[] = [];
  const added = sum(d.stockAdded);
  const collected = sum(d.stockCollected);
  warehouse.push(added ? `Finished stock added: ${formatQty(added)} crowns (${plural(d.stockAdded.length, "batch", "batches")}).` : "No finished stock added.");
  if (collected) warehouse.push(`Collected or dispatched: ${formatQty(collected)} crowns (${plural(d.stockCollected.length, "batch", "batches")}).`);
  if (d.pickupsRequested) warehouse.push(`${plural(d.pickupsRequested, "pickup request")} waiting for a time.`);
  for (const m of d.lowMaterials) warehouse.push(`Low: ${m.name}, ${n(m.on_hand)} ${m.unit} left (reorder at ${n(m.reorder_level)}).`);

  // ---- Maintenance ----
  const maint: string[] = [];
  const downtime = sum(d.maintenance.map((m) => m.minutes));
  if (d.maintenance.length === 0) maint.push("No maintenance logged.");
  else {
    maint.push(`${plural(d.maintenance.length, "job")}, ${duration(downtime)} of downtime.`);
    for (const m of d.maintenance) {
      maint.push(`${m.machine} · ${m.kind}: ${m.description}${m.stopped ? ` (${duration(m.minutes)} stopped${m.open ? ", still going on" : ""})` : m.open ? " (still going on)" : ""}.`);
    }
  }
  for (const m of d.machinesDown) maint.push(`Down: ${m.name} since ${formatDate(m.since)}${m.note ? ` (${m.note})` : ""}.`);

  // ---- Before the day is closed ----
  const checks: string[] = [];
  const missingShifts = SHIFTS.filter((s) => !d.production.some((p) => p.shift === s));
  if (missingShifts.length) checks.push(`No production logged for shift ${missingShifts.join(", ")}.`);
  const unpublished = d.production.filter((p) => !p.published).length;
  if (unpublished) checks.push(`${plural(unpublished, "production entry", "production entries")} not published (customers don't see ${unpublished === 1 ? "it" : "them"} yet).`);
  if (d.printRuns.length === 0) checks.push("No printed sheets logged.");
  for (const p of d.inOven) {
    const mins = Math.max(0, Math.round((new Date(d.now).getTime() - new Date(p.started_at).getTime()) / 60000));
    checks.push(`Stillage ${p.stillage_no ?? "(no number)"} still in the ${p.stage === "base_coat" ? "base coat" : p.stage} oven (${mins} min): log it out.`);
  }
  const unpublishedQc = d.inspections.filter((i) => !i.published).length;
  if (unpublishedQc) checks.push(`${plural(unpublishedQc, "inspection")} not published.`);
  if (d.unsignedCertificates.length) {
    checks.push(`${plural(d.unsignedCertificates.length, "certificate")} waiting for a signature: ${d.unsignedCertificates.map((c) => `batch ${c.batch_no} (${c.order_no})`).join(", ")}.`);
  }
  if (d.inboxWaiting) checks.push(`${plural(d.inboxWaiting, "order")} waiting in the inbox.`);
  const openJobs = d.maintenance.filter((m) => m.open);
  if (openJobs.length) checks.push(`${plural(openJobs.length, "maintenance job")} still open: ${openJobs.map((m) => m.machine).join(", ")}. Finish ${openJobs.length === 1 ? "it" : "them"} if done.`);
  for (const sv of d.servicesOverdue) checks.push(`${sv.name}: planned service overdue by ${plural(sv.days, "day")}.`);

  // ---- In a few sentences ----
  const be = (c: number) => (c === 1 ? "is" : "are");
  const shiftsRan = SHIFTS.filter((s) => d.production.some((p) => p.shift === s)).length;
  const said: string[] = [];
  said.push(
    produced
      ? `The presses made ${formatQty(produced)} crowns over ${plural(shiftsRan, "shift")}, with ${pct(rejects, produced)} camera rejects.`
      : "No production was logged.",
  );
  if (d.printRuns.length) said.push(`${plural(d.printRuns.length, "stillage")} ${d.printRuns.length === 1 ? "was" : "were"} printed (${n(printed)} good sheets).`);
  said.push(
    d.inspections.length
      ? `Quality inspected ${plural(d.inspections.length, "batch", "batches")}: ${n(released)} released${held ? `, ${n(held)} on hold` : ""}.`
      : "No batches were inspected.",
  );
  said.push(
    `${d.newOrders.length ? `${plural(d.newOrders.length, "new order")} came in` : "No new orders came in"}${d.dueSoon.length ? `; ${plural(d.dueSoon.length, "order")} ${be(d.dueSoon.length)} due within 7 days` : ""}.`,
  );
  if (downtime) said.push(`Machines were stopped for ${duration(downtime)}${d.machinesDown.length ? `, and ${plural(d.machinesDown.length, "machine")} ${be(d.machinesDown.length)} still down` : ""}.`);
  else if (d.machinesDown.length) said.push(`${plural(d.machinesDown.length, "machine")} ${be(d.machinesDown.length)} down.`);
  if (d.lowMaterials.length) said.push(`${plural(d.lowMaterials.length, "raw material")} ${be(d.lowMaterials.length)} at or below the reorder level (${d.lowMaterials.map((m) => m.name).join(", ")}).`);
  said.push(checks.length ? `${plural(checks.length, "item")} to check before the day is closed.` : "Everything looks logged.");

  const kpis = [
    { label: "Crowns produced", value: formatQty(produced), sub: `${pct(rejects, produced)} camera rejects` },
    { label: "Good sheets printed", value: n(printed), sub: plural(d.printRuns.length, "stillage") },
    { label: "Batches released", value: n(released), sub: held ? `${n(held)} on hold` : "none on hold" },
    { label: "New orders", value: n(d.newOrders.length), sub: d.inboxWaiting ? `${n(d.inboxWaiting)} in the inbox` : "inbox clear" },
  ];

  return {
    date: d.date,
    heading: `End of day report · ${formatDate(d.date)}`,
    summary: said.join(" "),
    kpis,
    checks,
    sections: [
      { title: "Production", lines: production },
      { title: "Printed sheets", lines: sheets },
      { title: "Quality", lines: quality },
      { title: "Orders", lines: orders },
      { title: "Warehouse and materials", lines: warehouse },
      { title: "Maintenance", lines: maint },
    ],
  };
}

/** The report as email paragraphs (the email layout escapes and breaks lines). */
export function eodEmailLines(r: EodReport): string[] {
  return [
    `SUMMARY\n${r.summary}`,
    r.kpis.map((k) => `${k.label}: ${k.value}${k.sub ? ` (${k.sub})` : ""}`).join("\n"),
    `CHECK BEFORE CLOSING THE DAY\n${r.checks.length ? r.checks.map((c) => `• ${c}`).join("\n") : "• Everything looks logged."}`,
    ...r.sections.map((s) => `${s.title.toUpperCase()}\n${s.lines.map((l) => `• ${l}`).join("\n")}`),
  ];
}
