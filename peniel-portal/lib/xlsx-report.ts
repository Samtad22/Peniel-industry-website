import "server-only";
import ExcelJS from "exceljs";

// Report downloads as real Excel files in Peniel's corporate style: a
// letterhead (company, report title, period, when it was made), dark column
// headings, thousands separators, a totals row, frozen headings, filters,
// and a print layout (landscape, fits the page width, page numbers).

export type Cell = string | number | boolean | null | undefined;

export type SheetSpec = {
  /** "Production entries" */
  title: string;
  /** "1 Sep 2026 to 27 Sep 2026" */
  period: string;
  header: string[];
  rows: Cell[][];
  /** Headings of the columns to total at the bottom. */
  totals?: string[];
};

const INK = "FF201E1D";
const RED = "FFEC3013";
const PAPER = "FFF7F6F6";
const RULE = "FFE3E1E0";
const GREY = "FF6B6866";

const stamp = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" });

/** The workbook as an .xlsx file. */
export async function buildXlsx(spec: SheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Peniel Portal";
  wb.company = "Peniel Industry PLC";
  wb.title = spec.title;
  wb.created = new Date();

  const ws = wb.addWorksheet(spec.title.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8Peniel Industry PLC · ${spec.title} · Internal&R&8Page &P of &N` },
  });
  const cols = spec.header.length;
  const last = ws.getColumn(cols).letter;

  // Letterhead.
  ws.mergeCells(`A1:${last}1`);
  const co = ws.getCell("A1");
  co.value = "PENIEL INDUSTRY PLC";
  co.font = { name: "Arial", size: 16, bold: true, color: { argb: RED } };
  ws.getRow(1).height = 26;
  ws.mergeCells(`A2:${last}2`);
  const t = ws.getCell("A2");
  t.value = spec.title;
  t.font = { name: "Arial", size: 13, bold: true, color: { argb: INK } };
  ws.getRow(2).height = 20;
  ws.mergeCells(`A3:${last}3`);
  const meta = ws.getCell("A3");
  meta.value = `Period: ${spec.period}   ·   Prepared ${stamp.format(new Date()).replace("Sept", "Sep")} (Addis Ababa)   ·   Bole Lemi Industrial Park, Addis Ababa   ·   Internal and confidential`;
  meta.font = { name: "Arial", size: 9, italic: true, color: { argb: GREY } };
  // A red rule under the letterhead.
  for (let c = 1; c <= cols; c++) ws.getCell(4, c).border = { top: { style: "medium", color: { argb: RED } } };
  ws.getRow(4).height = 6;

  // Column headings.
  const head = ws.getRow(5);
  spec.header.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: INK } } };
  });
  head.height = 30;

  // Which columns hold numbers, and whether they have decimals.
  const numeric = spec.header.map((_, i) => spec.rows.some((r) => typeof r[i] === "number") && spec.rows.every((r) => r[i] == null || r[i] === "" || typeof r[i] === "number"));
  const decimals = spec.header.map((_, i) => spec.rows.some((r) => typeof r[i] === "number" && !Number.isInteger(r[i])));

  spec.rows.forEach((r, ri) => {
    const row = ws.getRow(6 + ri);
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = typeof v === "boolean" ? (v ? "Yes" : "No") : (v ?? null);
      cell.font = { name: "Arial", size: 10, color: { argb: INK } };
      cell.alignment = { vertical: "top", horizontal: numeric[i] ? "right" : "left", wrapText: typeof v === "string" && v.length > 40 };
      if (numeric[i]) cell.numFmt = decimals[i] ? "#,##0.00" : "#,##0";
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } };
      cell.border = { bottom: { style: "hair", color: { argb: RULE } } };
    });
  });

  // Totals.
  const end = 5 + spec.rows.length;
  if (spec.rows.length && spec.totals?.length) {
    const tr = ws.getRow(end + 1);
    tr.getCell(1).value = "Total";
    spec.header.forEach((h, i) => {
      const cell = tr.getCell(i + 1);
      if (spec.totals!.includes(h) && numeric[i]) {
        const col = ws.getColumn(i + 1).letter;
        cell.value = { formula: `SUBTOTAL(9,${col}6:${col}${end})`, result: spec.rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) };
        cell.numFmt = decimals[i] ? "#,##0.00" : "#,##0";
        cell.alignment = { horizontal: "right" };
      }
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: INK } };
      cell.border = { top: { style: "thin", color: { argb: INK } }, bottom: { style: "double", color: { argb: INK } } };
    });
  }
  if (!spec.rows.length) {
    ws.mergeCells(`A6:${last}6`);
    ws.getCell("A6").value = "Nothing recorded in this period.";
    ws.getCell("A6").font = { name: "Arial", size: 10, italic: true, color: { argb: GREY } };
  }

  // Column widths from the content (within reason).
  spec.header.forEach((h, i) => {
    const longest = Math.max(h.length * 0.9, ...spec.rows.slice(0, 500).map((r) => (r[i] == null ? 0 : String(typeof r[i] === "number" ? (r[i] as number).toLocaleString("en-US") : r[i]).length)));
    ws.getColumn(i + 1).width = Math.min(48, Math.max(10, Math.round(longest + 3)));
  });

  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, end), column: cols } };
  ws.pageSetup.printTitlesRow = "5:5";

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** `peniel-production-2026-09-01-to-2026-09-30.xlsx` */
export const xlsxName = (kind: string, from: string, to: string) => `peniel-${kind}-${from}-to-${to}.xlsx`;
