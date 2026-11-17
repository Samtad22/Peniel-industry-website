// The Certificate of Analysis (form PIC-OF-053) as a PDF, laid out like the
// certificate page (/certificates/[id]). Made on the server with pdf-lib (no
// browser): emailed to Peniel and saved in Documents when a certificate is
// issued, and downloadable from the certificate page. It shows exactly what
// certificate_of_analysis() returns for the caller, so a customer never gets
// more than the page shows them.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatDate } from "./format.ts";
import { checkMeasure, DEFECT_SAMPLE, MEASURES, measureValue } from "./qc.ts";
import type { CoaSettings } from "./settings.ts";

/** What certificate_of_analysis() returns (the fields the certificate prints). */
export type CertificateData = {
  id: string;
  final: boolean;
  released: boolean;
  signed: boolean;
  legacy: boolean;
  batch_no: string;
  inspected_at: string;
  published_at: string | null;
  sample_size: number;
  result: "released" | "on_hold" | null;
  order_no: string;
  po_number: string;
  company: string;
  shipped_to: string;
  brand: string;
  crown_size: string | null;
  liner: string | null;
  liner_type_id: string | null;
  finish: string | null;
  quantity: number | null;
  delivered_at: string | null;
  results: Record<string, unknown>;
  checks: { code: string; label: string; count: number }[];
  prepared_by: string | null;
  signatures: Record<string, { name: string; image: string; signed_at: string } | undefined>;
};

export const fmtResult = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
export const pctOf = (count: number, sample: number) => (sample > 0 ? `${fmtResult(Math.round((count / sample) * 10000) / 100)}%` : "-");

/** The Liner Type ID the certificate prints: the batch's, else PVC / the Settings one. */
export const linerTypeOf = (c: Pick<CertificateData, "liner" | "liner_type_id">, coa: Pick<CoaSettings, "linerTypeId">) =>
  c.liner_type_id || (c.liner === "PVC" ? "PVC" : coa.linerTypeId);

/** "COA-B-0142-Habesha.pdf" */
export function certificateFileName(c: Pick<CertificateData, "batch_no" | "brand">): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `COA-${clean(c.batch_no) || "batch"}${c.brand ? `-${clean(c.brand)}` : ""}.pdf`;
}

const RED = rgb(0.6, 0.08, 0.08);
const INK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.4, 0.4, 0.4);

/** The PDF's built-in font has no ≥ or ≤ (and a few others): write them out. */
function writable(font: PDFFont): (s: string) => string {
  const ok = new Set(font.getCharacterSet());
  const swap: Record<string, string> = { "≥": ">=", "≤": "<=", "−": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", " ": " " };
  return (s) =>
    Array.from(s ?? "")
      .map((ch) => (ch === "\n" || ok.has(ch.codePointAt(0)!) ? ch : (swap[ch] ?? "?")))
      .join("");
}

/** Words into lines no wider than `width`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Text cut to fit a width, with "..." when it doesn't. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

async function embedDataUrl(doc: PDFDocument, dataUrl: string | undefined): Promise<PDFImage | null> {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl ?? "");
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2], "base64");
    return m[1].toLowerCase() === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

/**
 * The certificate as PDF bytes (A4, one page). `logo`: the Peniel logo PNG,
 * if at hand (the PDF still reads "PENIEL" without it).
 */
export async function certificatePdf(c: CertificateData, coa: CoaSettings, logo?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Certificate of Analysis, batch ${c.batch_no}`);
  doc.setSubject(`${c.brand} · order ${c.order_no} · PO ${c.po_number}`);
  doc.setAuthor(coa.company);
  doc.setCreator("Peniel Portal");
  const page: PDFPage = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = writable(font);
  const W = 595.28;
  const L = 40;
  const R = W - 40;
  let y = 841.89 - 40;

  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) => {
    const size = o.size ?? 9;
    const f = o.f ?? font;
    const t = o.maxWidth ? fit(safe(s), f, size, o.maxWidth) : safe(s);
    page.drawText(t, { x, y: yy, size, font: f, color: o.color ?? INK });
  };
  const box = (x: number, yTop: number, w: number, h: number, thick = 0.8) =>
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: INK, borderWidth: thick });
  const line = (x1: number, y1: number, x2: number, y2: number, thick = 0.6) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: thick, color: INK });

  // Not final: say so across the top.
  if (!c.final) {
    const msg = c.released
      ? "DRAFT: waiting for the quality manager's signature."
      : c.signed
        ? "DRAFT: signed, but not released and published."
        : "DRAFT: not released, published and signed.";
    box(L, y, R - L, 20, 1.5);
    text(msg, L + 8, y - 14, { f: bold, size: 10, color: RED });
    y -= 30;
  }

  // Header block: logo | company / title | document no. / revision / page.
  const hH = 30;
  const c1 = 120;
  const c3 = 150;
  const c2 = R - L - c1 - c3;
  box(L, y, R - L, hH * 2, 1.5);
  line(L + c1, y, L + c1, y - hH * 2, 1.5);
  line(L + c1, y - hH, R, y - hH, 1.5);
  line(L + c1 + c2, y, L + c1 + c2, y - hH * 2, 1.5);
  line(L + c1 + c2 + c3 / 2, y - hH, L + c1 + c2 + c3 / 2, y - hH * 2, 1.5);
  let logoW = 0;
  if (logo) {
    try {
      const img = await doc.embedPng(logo);
      const s = 34 / img.height;
      logoW = img.width * s;
      page.drawImage(img, { x: L + 8, y: y - hH - 17, width: logoW, height: 34 });
    } catch {
      logoW = 0;
    }
  }
  text("PENIEL", L + 12 + logoW, y - hH - 6, { f: bold, size: 15, color: RED });
  text("Company Name:", L + c1 + 6, y - 10, { size: 7.5, color: RED });
  text(coa.company, L + c1 + 6, y - 24, { f: bold, size: 11, color: RED, maxWidth: c2 - 12 });
  text("Document No.:", L + c1 + c2 + 6, y - 10, { size: 7.5, color: RED });
  text(coa.documentNo, L + c1 + c2 + 6, y - 24, { size: 10.5, color: RED, maxWidth: c3 - 12 });
  const title = "Certificate Of Analysis";
  text(title, L + c1 + (c2 - bold.widthOfTextAtSize(title, 12.5)) / 2, y - hH - 19, { f: bold, size: 12.5, color: RED });
  text(`Revision No: ${coa.revision}`, L + c1 + c2 + 6, y - hH - 18, { size: 8, color: RED, maxWidth: c3 / 2 - 10 });
  text("Page 1 of 1", L + c1 + c2 + c3 / 2 + 6, y - hH - 18, { size: 8, color: RED });
  y -= hH * 2 + 20;

  // The fields, two columns.
  const half = (R - L - 24) / 2;
  const field = (label: string, value: string, x: number, yy: number, w: number) => {
    text(`${label}:`, x, yy, { size: 8.5 });
    const lx = x + font.widthOfTextAtSize(safe(`${label}:`), 8.5) + 4;
    line(lx, yy - 2.5, x + w, yy - 2.5, 0.5);
    if (value) text(value, lx + 2, yy, { f: bold, size: 8.5, maxWidth: x + w - lx - 4 });
  };
  const rows: [string, string][][] = [
    [["Crown Type", [c.crown_size, c.brand, c.finish].filter(Boolean).join(" · ")], ["Analysis Registration Number", `COA-${c.batch_no}`]],
    [["Batch No.", c.batch_no], ["Liner Type ID", linerTypeOf(c, coa)]],
    [["Mfg. Date", formatDate(c.inspected_at)], ["", "Raw materials are Food Grade."]],
    [["Best Before date", ""], ["Shipped To", c.shipped_to]],
    [["Quantity", c.quantity ? Number(c.quantity).toLocaleString("en-US") : ""], ["Date delivered", c.delivered_at ? formatDate(c.delivered_at) : ""]],
  ];
  for (const [a, b] of rows) {
    field(a[0], a[1], L, y, half);
    if (b[0]) field(b[0], b[1], L + half + 24, y, half);
    else text(b[1], L + half + 24, y, { size: 8.5 });
    y -= 17;
  }
  y -= 4;

  const para =
    `This is to certify that the crown corks contained in this shipment meet and conform to all requirements called for in PI/Contract specifications number: PO ${c.po_number} (order ${c.order_no}).\n` +
    "Furthermore, the crown corks in the specified delivery have been analyzed and the data recorded for the specific standards shown below.";
  for (const l of wrap(safe(para), font, 8.5, R - L)) {
    text(l, L, y, { size: 8.5 });
    y -= 12;
  }
  y -= 6;

  // The results table.
  const cols = [28, 168, 60, 92, 82, R - L - 28 - 168 - 60 - 92 - 82];
  const xs = cols.reduce<number[]>((a, w, i) => [...a, (a[i] ?? L) + w], [L]);
  const rowH = 14.5;
  const tableRow = (cells: string[], o: { head?: boolean; flag?: boolean } = {}) => {
    box(L, y, R - L, rowH, 0.6);
    for (let i = 1; i < cols.length; i++) line(xs[i], y, xs[i], y - rowH, 0.6);
    cells.forEach((cell, i) => {
      const f = o.head || i === 4 || (i === 5 && o.flag) ? bold : font;
      const color = i === 5 && o.flag ? RED : INK;
      const centre = !o.head && (i === 0 || i === 2 || i === 3 || i === 4);
      const t = fit(safe(cell), f, 8, cols[i] - 6);
      const x = centre ? xs[i] + (cols[i] - f.widthOfTextAtSize(t, 8)) / 2 : xs[i] + 3;
      page.drawText(t, { x, y: y - 10.2, size: 8, font: f, color });
    });
    y -= rowH;
  };
  tableRow(["S/N", "Description of Parameters", "Sample Size", "Standard", "Obtained result", "Remark"], { head: true });
  let n = 0;
  for (const m of MEASURES) {
    const v = measureValue(c.results, m.key);
    const check = checkMeasure(m, v);
    tableRow(
      [`${++n}.`, m.label, m.sample, `(${m.spec}) ${m.unit}`, v == null ? "-" : `${fmtResult(v)} ${m.unit}`, check == null ? "Not measured" : check === "ok" ? "Conforms" : "Out of spec"],
      { flag: check != null && check !== "ok" },
    );
  }
  for (const d of c.checks) {
    const sample = DEFECT_SAMPLE[d.code] ?? c.sample_size;
    tableRow([`${++n}.`, d.label, String(sample), "0%", pctOf(d.count, sample), d.count > 0 ? `${d.count} found` : "Conforms"], { flag: d.count > 0 });
  }
  y -= 22;

  // Prepared by, signature, date.
  const sig = c.signatures?.prepared;
  field("Prepared By", c.prepared_by ?? "", L, y, half);
  y -= 44;
  field("Signature", "", L, y, half);
  const sigImg = await embedDataUrl(doc, sig?.image);
  if (sigImg) {
    // Sits on the signature line, no taller than the gap above it.
    const w = Math.min((sigImg.width / sigImg.height) * 34, half - 70);
    page.drawImage(sigImg, { x: L + 60, y: y - 3, width: w, height: (w / sigImg.width) * sigImg.height });
  }
  y -= 20;
  field("Date", sig ? formatDate(sig.signed_at) : "", L, y, half);

  // Footer.
  const fy = 40;
  line(L, fy + 12, R, fy + 12, 0.4);
  text(`Tel: ${coa.tel}`, L, fy, { size: 7.5, color: GREY, maxWidth: (R - L) / 2 });
  const issued = `Issued through the Peniel Portal${c.published_at ? ` on ${formatDate(c.published_at)}` : ""} · ${c.company}`;
  text(issued, R - Math.min(font.widthOfTextAtSize(safe(issued), 7.5), (R - L) / 2), fy, { size: 7.5, color: GREY, maxWidth: (R - L) / 2 });

  return doc.save();
}
