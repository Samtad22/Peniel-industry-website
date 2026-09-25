import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import PrintButton from "@/components/ui/PrintButton";
import { getProfile, homeFor } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { checkMeasure, COA_FORM, DEFECT_SAMPLE, MEASURES, measureValue } from "@/lib/qc";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Certificate of Analysis" };

type Certificate = {
  id: string;
  final: boolean;
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
  crown_size: string;
  liner: string;
  finish: string | null;
  quantity: number | null;
  delivered_at: string | null;
  results: Record<string, unknown>;
  checks: { code: string; label: string; count: number }[];
  prepared_by: string | null;
  approved_by: string | null;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));
const pct = (count: number, sample: number) => (sample > 0 ? `${fmt(Math.round((count / sample) * 10000) / 100)}%` : "-");

/**
 * Certificate of Analysis for one batch, laid out like the Quality team's
 * form PIC-OF-053 rev. 006. Customers can open it for their own released,
 * published batches only (enforced by certificate_of_analysis in the
 * database); staff see any batch, marked as a draft until it is final.
 */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=/certificates/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("certificate_of_analysis", { p_inspection_id: id });
  const c = data as Certificate | null;
  if (!c) notFound();

  const cell = "border border-text px-2.5 py-1.5 print:px-2 print:py-[3px]";
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0">{label}:</span>
      <span className="min-w-0 flex-1 border-b border-text px-1 font-semibold">{value || " "}</span>
    </div>
  );
  let n = 0;

  return (
    <main className="min-h-screen bg-neutral-200 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[860px] flex-wrap items-center justify-between gap-3 print:hidden">
        <a href={homeFor(profile)} className="text-[14px]">
          ← Back to the portal
        </a>
        <PrintButton />
      </div>

      <article className="mx-auto flex max-w-[860px] flex-col gap-5 bg-white p-6 text-[13px] text-text sm:p-10 print:max-w-none print:gap-3 print:p-0 print:text-[10.5px]">
        {!c.final && (
          <div className="border-2 border-accent-800 px-3 py-2 text-center font-extrabold text-accent-800">
            DRAFT: not released and published, so customers can&apos;t see this certificate.
          </div>
        )}
        <table className="w-full border-collapse border-2 border-text">
          <tbody>
            <tr>
              <td className={`${cell} w-[22%] border-2`} rowSpan={2}>
                <div className="flex items-center gap-2">
                  <Image src="/img/logo-icon.png" alt="" width={40} height={40} />
                  <b className="text-[20px] tracking-[0.02em] text-accent-800">PENIEL</b>
                </div>
              </td>
              <td className={`${cell} border-2`}>
                <span className="text-[11px] text-accent-800">Company Name:</span>
                <div className="text-[16px] font-extrabold text-accent-800">{COA_FORM.company}</div>
              </td>
              <td className={`${cell} w-[22%] border-2`} colSpan={2}>
                <span className="text-[11px] text-accent-800">Document No.:</span>
                <div className="text-[15px] text-accent-800">{COA_FORM.documentNo}</div>
              </td>
            </tr>
            <tr>
              <td className={`${cell} border-2 text-center text-[17px] font-extrabold text-accent-800`}>Certificate Of Analysis</td>
              <td className={`${cell} border-2 text-[12px] text-accent-800`}>
                Revision No: <b>{COA_FORM.revision}</b>
              </td>
              <td className={`${cell} border-2 text-[12px] text-accent-800`}>Page 1 of 1</td>
            </tr>
          </tbody>
        </table>

        <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2 print:grid-cols-2 print:gap-y-1.5">
          {field("Crown Type", [c.crown_size, c.brand, c.finish].filter(Boolean).join(" · "))}
          {field("Analysis Registration Number", `COA-${c.batch_no}`)}
          {field("Batch No.", c.batch_no)}
          {field("Liner Type ID", c.liner === "PVC" ? "PVC" : COA_FORM.linerTypeId)}
          {field("Mfg. Date", formatDate(c.inspected_at))}
          <div>Raw materials are <u>Food Grade</u>.</div>
          {field("Best Before date", "")}
          {field("Shipped To", c.shipped_to)}
          {field("Quantity", c.quantity ? Number(c.quantity).toLocaleString("en-US") : "")}
          {field("Date delivered", c.delivered_at ? formatDate(c.delivered_at) : "")}
        </div>

        <p className="m-0 leading-relaxed">
          This is to certify that the crown corks contained in this shipment meet and conform to all requirements called for in
          PI/Contract specifications number: <b className="border-b border-text px-1">PO {c.po_number}</b> (order {c.order_no}).
          <br />
          Furthermore, the crown corks in the specified delivery have been analyzed and the data recorded for the specific standards
          shown below.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="text-left">
                {["S/N", "Description of Parameters", "Sample Size", "Standard", "Obtained result", "Remark"].map((h) => (
                  <th key={h} className={`${cell} font-extrabold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEASURES.map((m) => {
                const v = measureValue(c.results, m.key);
                const check = checkMeasure(m, v);
                return (
                  <tr key={m.key}>
                    <td className={`${cell} text-center`}>{++n}.</td>
                    <td className={cell}>{m.label}</td>
                    <td className={`${cell} text-center`}>{m.sample}</td>
                    <td className={`${cell} text-center`}>
                      ({m.spec}) {m.unit}
                    </td>
                    <td className={`${cell} text-center font-semibold`}>{v == null ? "-" : `${fmt(v)} ${m.unit}`}</td>
                    <td className={`${cell} ${check && check !== "ok" ? "font-extrabold text-accent-800" : ""}`}>
                      {check == null ? "Not measured" : check === "ok" ? "Conforms" : "Out of spec"}
                    </td>
                  </tr>
                );
              })}
              {c.checks.map((d) => {
                const sample = DEFECT_SAMPLE[d.code] ?? c.sample_size;
                return (
                  <tr key={d.code}>
                    <td className={`${cell} text-center`}>{++n}.</td>
                    <td className={cell}>{d.label}</td>
                    <td className={`${cell} text-center`}>{sample}</td>
                    <td className={`${cell} text-center`}>0%</td>
                    <td className={`${cell} text-center font-semibold`}>{pct(d.count, sample)}</td>
                    <td className={`${cell} ${d.count > 0 ? "font-extrabold text-accent-800" : ""}`}>{d.count > 0 ? `${d.count} found` : "Conforms"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-x-10 gap-y-3 pt-4 sm:grid-cols-2 print:grid-cols-2 print:gap-y-2 print:pt-2">
          {field("Prepared By", c.prepared_by ?? "")}
          {field("Approved By", c.approved_by ?? "")}
          {field("Signature", "")}
          {field("Signature", "")}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-divider pt-3 text-[12px] opacity-70">
          <span>Tel: {COA_FORM.tel}</span>
          <span>
            Issued through the Peniel Portal{c.published_at ? ` on ${formatDate(c.published_at)}` : ""} · {c.company}
          </span>
        </div>
      </article>
    </main>
  );
}
