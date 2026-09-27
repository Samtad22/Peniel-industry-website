import type { Metadata } from "next";
import ReportDocument from "@/components/ReportDocument";
import { requireStaff } from "@/lib/auth";
import { buildEodReport } from "@/lib/eod-report";
import { loadEodInput } from "@/lib/eod-data";
import { addisDateISO, formatDate } from "@/lib/format";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "End of day report" };

/** The end-of-day report as a document, to print or save as a PDF (admin only). */
export default async function EodDocumentPage({ searchParams }: { searchParams: Promise<{ d?: string; print?: string }> }) {
  await requireStaff(opsRolesFor("reports"));
  const sp = await searchParams;
  const today = addisDateISO(new Date());
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;
  const r = buildEodReport(await loadEodInput(await createClient(), date));
  return <ReportDocument report={r} title="End of day report" period={formatDate(date)} back={`/ops/reports/eod?d=${date}`} autoPrint={sp.print === "1"} />;
}
