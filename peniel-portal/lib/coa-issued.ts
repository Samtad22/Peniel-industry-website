import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { certificateFileName, certificatePdf, type CertificateData } from "@/lib/coa-pdf";
import { eodRecipients } from "@/lib/eod-data";
import { sendEmails } from "@/lib/email";
import { getSettings } from "@/lib/settings-server";
import { siteUrl } from "@/lib/supabase/env";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** The Peniel logo for the PDF: from the app's files, else the site; none is fine. */
export async function penielLogo(): Promise<Uint8Array | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "img", "logo-icon.png"));
  } catch {
    try {
      const res = await fetch(`${siteUrl()}/img/logo-icon.png`);
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  }
}

/**
 * A certificate was just issued (released, published and signed, for these
 * results): save its PDF in Documents for the order, internal (an earlier PDF
 * of the same certificate is replaced), and email it to the report
 * recipients (Settings; else all active admins). Called once per issue, from
 * notifyCertificateReady. Each step runs even if another fails.
 */
export async function saveAndSendCertificate(db: Admin, inspectionId: string): Promise<void> {
  const { data } = await db.rpc("certificate_of_analysis", { p_inspection_id: inspectionId });
  const c = data as CertificateData | null;
  if (!c?.final) return;
  const { data: link } = await db
    .from("qc_inspections")
    .select("order_id, orders(company_id, brand_id)")
    .eq("id", inspectionId)
    .maybeSingle<{ order_id: string; orders: { company_id: string; brand_id: string } | null }>();
  if (!link?.orders) return;

  const { coa } = await getSettings();
  const bytes = await certificatePdf(c, coa, await penielLogo());
  const name = certificateFileName(c);

  // 1. Saved in Documents, under the order (one PDF per certificate: the latest).
  try {
    const folder = `${link.orders.company_id}/documents/coa/${inspectionId}`;
    const filePath = `${folder}/${name}`;
    const { data: old } = await db.from("documents").select("id, file_path").like("file_path", `${folder}/%`);
    const { error: upErr } = await db.storage.from("documents").upload(filePath, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;
    const stale = (old ?? []).filter((d) => d.file_path !== filePath);
    if (stale.length) {
      await db.storage.from("documents").remove(stale.map((d) => d.file_path));
    }
    if (old?.length) await db.from("documents").delete().in("id", old.map((d) => d.id));
    const { error } = await db.from("documents").insert({
      company_id: link.orders.company_id,
      order_id: link.order_id,
      brand_id: link.orders.brand_id,
      type: "certificate_of_analysis",
      title: `Certificate of Analysis · batch ${c.batch_no}`,
      file_name: name,
      file_path: filePath,
      size_bytes: bytes.length,
      mime_type: "application/pdf",
      visibility: "internal",
    });
    if (error) throw error;
  } catch (e) {
    console.error("certificate PDF not saved", inspectionId, (e as Error).message);
  }

  // 2. Emailed to Peniel, with the PDF.
  await sendEmails(
    await eodRecipients(db),
    {
      subject: `Certificate of Analysis issued: batch ${c.batch_no} (${c.brand})`,
      heading: "Certificate of Analysis issued",
      lines: [
        `Batch ${c.batch_no}, ${c.brand}, order ${c.order_no}, PO ${c.po_number}, ${c.company}.`,
        `Signed by ${c.prepared_by ?? "the quality manager"}. The customer has been told it's ready.`,
        `The PDF is attached and saved in Documents (${name}).`,
      ],
      cta: { label: "Open the certificate", path: `/certificates/${c.id}` },
    },
    { kind: "certificate_issued", entityId: c.id },
    [{ filename: name, content: Buffer.from(bytes).toString("base64") }],
  );
}
