/**
 * One CSV line. Quotes where needed, and defuses values a spreadsheet would
 * run as a formula (a customer-typed PO number could start with `=`).
 */
export function csvLine(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

/** Rows (the first is the header) as a CSV file for Excel: a byte-order mark so it opens with the right characters. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => csvLine(r.map((v) => (typeof v === "boolean" ? String(v) : v)))).join("\r\n") + "\r\n";
}

/** `peniel-production-2026-09-01-to-2026-09-30.csv` */
export const csvName = (kind: string, from: string, to: string) => `peniel-${kind}-${from}-to-${to}.csv`;
