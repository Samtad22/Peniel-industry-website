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
