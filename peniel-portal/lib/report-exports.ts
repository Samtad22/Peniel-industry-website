// The report downloads on /ops/reports (Excel files in Peniel's style). Internal only.

export const EXPORTS = [
  { kind: "production", sheetTitle: "Production entries", title: "Production", sub: "Daily entries per liner and shift: crowns, camera rejects, order." },
  { kind: "sheets", sheetTitle: "Printed sheets by stillage", title: "Printed sheets", sub: "Each stillage: base coat, printing, varnish, lacquer, to the press." },
  { kind: "quality", sheetTitle: "Quality inspections", title: "Quality", sub: "Inspections with their measurements, defects and results." },
  { kind: "maintenance", sheetTitle: "Maintenance log", title: "Maintenance", sub: "Every job: machine, times, downtime, parts, who did it." },
  { kind: "orders", sheetTitle: "Orders placed", title: "Orders", sub: "Orders placed: customer, brand, PO, quantity, dates, status." },
  { kind: "materials", sheetTitle: "Raw material movements", title: "Raw materials", sub: "Every movement in and out, automatic and by hand." },
] as const;

export type ExportKind = (typeof EXPORTS)[number]["kind"];
export const isExportKind = (k: string): k is ExportKind => EXPORTS.some((e) => e.kind === k);
