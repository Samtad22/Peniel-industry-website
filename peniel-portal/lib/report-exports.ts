// The report downloads on /ops/reports (CSV files that open in Excel). Internal only.

export const EXPORTS = [
  { kind: "production", title: "Production", sub: "Daily entries per liner and shift: crowns, camera rejects, order." },
  { kind: "sheets", title: "Printed sheets", sub: "Each stillage: base coat, printing, varnish, lacquer, to the press." },
  { kind: "quality", title: "Quality", sub: "Inspections with their measurements, defects and results." },
  { kind: "maintenance", title: "Maintenance", sub: "Every job: machine, times, downtime, parts, who did it." },
  { kind: "orders", title: "Orders", sub: "Orders placed: customer, brand, PO, quantity, dates, status." },
  { kind: "materials", title: "Raw materials", sub: "Every movement in and out, automatic and by hand." },
] as const;

export type ExportKind = (typeof EXPORTS)[number]["kind"];
export const isExportKind = (k: string): k is ExportKind => EXPORTS.some((e) => e.kind === k);
