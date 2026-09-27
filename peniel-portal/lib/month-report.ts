// The monthly summary: a month of the plant's records in one page, emailed to
// the admins on the 1st and shown on /ops/reports/month. No AI or paid
// service. INTERNAL: staff only. Pure (no server imports); lib/month-data.ts
// loads the rows.

import { formatQty } from "./format.ts";

export type MonthInput = {
  /** `YYYY-MM` */
  month: string;
  production: { line: string; brand: string; customer: string; produced: number; rejects: number; date: string }[];
  stillages: { printed: boolean; good: number; spoiled: number; baseCoated: boolean; toPress: boolean }[];
  /** Finished stillages still in stock now. */
  sheetStock: number;
  inspections: { result: "released" | "on_hold" | null }[];
  sorting: { passed: number; waste: number }[];
  newOrders: { quantity: number; customer: string }[];
  /** Orders delivered, dispatched or ready for pickup during the month. */
  completedOrders: number;
  onHoldNow: number;
  maintenance: { machine: string; kind: string; minutes: number; stopped: boolean }[];
  materials: { name: string; unit: string; used: number; received: number; onHand: number }[];
};

export type MonthReport = {
  heading: string;
  kpis: { label: string; value: string; sub?: string }[];
  sections: { title: string; lines: string[] }[];
};

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const pct = (part: number, whole: number) => (whole > 0 ? `${((100 * part) / whole).toFixed(2)}%` : "-");
const plural = (c: number, one: string, many = `${one}s`) => `${n(c)} ${c === 1 ? one : many}`;
const hours = (minutes: number) => (minutes < 60 ? `${Math.round(minutes)} min` : `${(minutes / 60).toFixed(1)} h`);
const qty = (v: number) => (Math.abs(v) >= 1000 ? formatQty(v) : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));

/** `September 2026` */
export function monthName(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** The month before a `YYYY-MM-DD` day, as `YYYY-MM`. */
export function previousMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Group and sum, largest first. */
function totals<T>(rows: T[], key: (r: T) => string, val: (r: T) => number): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function buildMonthReport(d: MonthInput): MonthReport {
  // ---- Production ----
  const produced = sum(d.production.map((p) => p.produced));
  const rejects = sum(d.production.map((p) => p.rejects));
  const days = new Set(d.production.map((p) => p.date)).size;
  const production: string[] = [];
  if (!d.production.length) production.push("Nothing logged.");
  else {
    production.push(`${n(produced)} crowns produced (${formatQty(produced)}) on ${plural(days, "day")}, ${n(rejects)} camera rejects (${pct(rejects, produced)}).`);
    production.push(`Average ${formatQty(produced / Math.max(1, days))} crowns a working day.`);
    for (const [line, v] of totals(d.production, (p) => p.line, (p) => p.produced)) production.push(`${line}: ${formatQty(v)} crowns.`);
    for (const [who, v] of totals(d.production, (p) => `${p.customer} · ${p.brand}`, (p) => p.produced).slice(0, 10)) production.push(`${who}: ${formatQty(v)} crowns.`);
  }

  // ---- Printed sheets ----
  const printed = d.stillages.filter((s) => s.printed);
  const good = sum(printed.map((s) => s.good));
  const spoiled = sum(printed.map((s) => s.spoiled));
  const sheets: string[] = [];
  if (!d.stillages.length) sheets.push("Nothing logged.");
  else {
    sheets.push(`${plural(printed.length, "stillage")} printed: ${n(good)} good sheets, ${n(spoiled)} spoiled (${pct(spoiled, good + spoiled)}).`);
    const base = d.stillages.filter((s) => s.baseCoated).length;
    if (base) sheets.push(`${plural(base, "stillage")} base-coated first.`);
    sheets.push(`${plural(d.stillages.filter((s) => s.toPress).length, "stillage")} sent to the presses.`);
  }
  sheets.push(`In stock now: ${plural(d.sheetStock, "finished stillage")}.`);

  // ---- Quality ----
  const released = d.inspections.filter((i) => i.result === "released").length;
  const held = d.inspections.filter((i) => i.result === "on_hold").length;
  const passed = sum(d.sorting.map((s) => s.passed));
  const waste = sum(d.sorting.map((s) => s.waste));
  const quality = [
    d.inspections.length ? `${plural(d.inspections.length, "inspection")}: ${n(released)} released, ${n(held)} on hold.` : "No inspections logged.",
    ...(d.sorting.length ? [`Sorting: ${n(passed)} cartons passed, ${n(waste)} cartons waste (${pct(waste, passed + waste)}).`] : []),
  ];

  // ---- Orders ----
  const orderQty = sum(d.newOrders.map((o) => o.quantity));
  const orders = [
    d.newOrders.length ? `${plural(d.newOrders.length, "new order")} for ${formatQty(orderQty)} crowns.` : "No new orders.",
    ...totals(d.newOrders, (o) => o.customer, (o) => o.quantity).map(([c, v]) => `${c}: ${formatQty(v)} crowns ordered.`),
    `${plural(d.completedOrders, "order")} completed (ready, dispatched or delivered).`,
    ...(d.onHoldNow ? [`${plural(d.onHoldNow, "order")} on hold now.`] : []),
  ];

  // ---- Maintenance ----
  const downtime = sum(d.maintenance.filter((m) => m.stopped).map((m) => m.minutes));
  const breakdowns = d.maintenance.filter((m) => m.kind === "Breakdown").length;
  const maint = d.maintenance.length
    ? [
        `${plural(d.maintenance.length, "job")}, ${plural(breakdowns, "breakdown")}, ${hours(downtime)} of downtime.`,
        ...totals(d.maintenance.filter((m) => m.stopped), (m) => m.machine, (m) => m.minutes).map(([mc, v]) => `${mc}: ${hours(v)} down.`),
      ]
    : ["No maintenance logged."];

  // ---- Raw materials ----
  const mats = d.materials.filter((m) => m.used || m.received);
  const materials = mats.length
    ? [
        `${plural(mats.length, "material")} used or received.`,
        ...mats.map((m) => `${m.name}: ${qty(m.used)} ${m.unit} used, ${qty(m.received)} ${m.unit} received, ${qty(m.onHand)} ${m.unit} on hand now.`),
      ]
    : ["No movements."];

  return {
    heading: `Monthly summary · ${monthName(d.month)}`,
    kpis: [
      { label: "Crowns produced", value: formatQty(produced), sub: `${pct(rejects, produced)} camera rejects` },
      { label: "Good sheets printed", value: n(good), sub: plural(printed.length, "stillage") },
      { label: "Batches released", value: n(released), sub: held ? `${n(held)} on hold` : "none on hold" },
      { label: "Downtime", value: hours(downtime), sub: plural(breakdowns, "breakdown") },
    ],
    sections: [
      { title: "Production", lines: production },
      { title: "Printed sheets", lines: sheets },
      { title: "Quality", lines: quality },
      { title: "Orders", lines: orders },
      { title: "Maintenance", lines: maint },
      { title: "Raw materials", lines: materials },
    ],
  };
}

/** The summary as email paragraphs. */
export function monthEmailLines(r: MonthReport): string[] {
  return [
    r.kpis.map((k) => `${k.label}: ${k.value}${k.sub ? ` (${k.sub})` : ""}`).join("\n"),
    ...r.sections.map((s) => `${s.title.toUpperCase()}\n${s.lines.map((l) => `• ${l}`).join("\n")}`),
  ];
}
