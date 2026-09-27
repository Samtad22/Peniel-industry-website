import type { Metadata } from "next";
import ReportDocument from "@/components/ReportDocument";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { loadMonthInput } from "@/lib/month-data";
import { buildMonthReport, monthName, previousMonth } from "@/lib/month-report";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Monthly summary" };

/** The monthly summary as a document, to print or save as a PDF (admin only). */
export default async function MonthDocumentPage({ searchParams }: { searchParams: Promise<{ m?: string; print?: string }> }) {
  await requireStaff(opsRolesFor("reports"));
  const sp = await searchParams;
  const thisMonth = addisDateISO(new Date()).slice(0, 7);
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) && sp.m <= thisMonth ? sp.m : previousMonth(`${thisMonth}-01`);
  const r = buildMonthReport(await loadMonthInput(await createClient(), month));
  return (
    <ReportDocument
      report={r}
      title="Monthly summary"
      period={`${monthName(month)}${month === thisMonth ? " (so far)" : ""}`}
      back={`/ops/reports/month?m=${month}`}
      autoPrint={sp.print === "1"}
    />
  );
}
