import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { certificateFileName, certificatePdf, linerTypeOf, type CertificateData } from "../../lib/coa-pdf.ts";

// A 1×1 PNG, as a drawn signature would be.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const coa = { company: "Peniel Industry Crown Cork Factory", documentNo: "PIC-OF-053", revision: "006", tel: "+251 11 668 9255", linerTypeId: "Contoform 0369" };
export const sample: CertificateData = {
  id: "c0000000-0000-4000-8000-000000000001",
  final: true,
  released: true,
  signed: true,
  legacy: false,
  batch_no: "B-0142",
  inspected_at: "2026-11-12T08:30:00Z",
  published_at: "2026-11-13T09:00:00Z",
  sample_size: 100,
  result: "released",
  order_no: "PN-26-0042",
  po_number: "HB-PO-2026-118",
  company: "Habesha Breweries S.C.",
  shipped_to: "Habesha Breweries S.C.",
  brand: "Heineken",
  crown_size: "26 mm",
  liner: "PVC-free",
  liner_type_id: "Actega Svelon 855",
  finish: "Gloss",
  quantity: 1_250_000,
  delivered_at: null,
  results: { shell_height_mm: 6.02, liner_weight_mg: 192, leaking_pressure_kgcm2: 7.5 },
  checks: [
    { code: "corrosion", label: "Corrosion", count: 0 },
    { code: "bent_crowns", label: "Bent crowns", count: 1 },
  ],
  prepared_by: "Selam Haile",
  signatures: { prepared: { name: "Selam Haile", image: PNG, signed_at: "2026-11-13T08:00:00Z" } },
};

test("the certificate as a one-page PDF", async () => {
  const bytes = await certificatePdf(sample, coa);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.ok(bytes.length > 2000);
  if (process.env.COA_PDF_OUT) writeFileSync(process.env.COA_PDF_OUT, bytes);
  // A draft, and characters the built-in font lacks (≥, ≤), still make a PDF.
  const draft = await certificatePdf({ ...sample, final: false, signed: false, signatures: {}, brand: "Habesha ≥ “Gold”" }, coa);
  assert.equal(Buffer.from(draft.slice(0, 5)).toString(), "%PDF-");
});

test("liner type and file name", () => {
  assert.equal(linerTypeOf(sample, coa), "Actega Svelon 855");
  assert.equal(linerTypeOf({ liner: "PVC-free", liner_type_id: null }, coa), "Contoform 0369");
  assert.equal(linerTypeOf({ liner: "PVC", liner_type_id: null }, coa), "PVC");
  assert.equal(certificateFileName({ batch_no: "B/0142 a", brand: "St. George" }), "COA-B-0142-a-St.-George.pdf");
});
