import type { Metadata } from "next";
import Link from "next/link";
import MonthEmailButton from "@/components/ops/MonthEmailButton";
import OpsHeader from "@/components/ops/OpsHeader";
import ReportView from "@/components/ops/ReportView";
import PrintButton from "@/components/ui/PrintButton";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { loadMonthInput } from "@/lib/month-data";
import { buildMonthReport, monthName, previousMonth } from "@/lib/month-report";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Monthly summary" };

/** The monthly summary (admin only); emailed to the admins on the 1st for the month before. */
export default async function MonthReportPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireStaff(opsRolesFor("reports"));
  const sp = await searchParams;
  const thisMonth = addisDateISO(new Date()).slice(0, 7);
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) && sp.m <= thisMonth ? sp.m : previousMonth(`${thisMonth}-01`);
  const supabase = await createClient();
  const r = buildMonthReport(await loadMonthInput(supabase, month));
  const next = month.endsWith("-12") ? `${Number(month.slice(0, 4)) + 1}-01` : `${month.slice(0, 5)}${String(Number(month.slice(5)) + 1).padStart(2, "0")}`;
  const link = (m: string, label: string) => (
    <Link href={`/ops/reports/month?m=${m}`} className="btn btn-secondary text-text no-underline">
      {label}
    </Link>
  );

  return (
    <>
      <OpsHeader
        crumb={{ label: "Reports", href: "/ops/reports", current: "Monthly summary" }}
        title={monthName(month)}
        sub={`Monthly summary${month === thisMonth ? " · so far this month" : ""} · emailed to admins on the 1st of each month`}
        actions={
          <div className="flex flex-wrap items-start gap-2 print:hidden">
            {link(previousMonth(`${month}-01`), "← Month before")}
            {month < thisMonth && link(next, "Next month →")}
            <PrintButton />
            <MonthEmailButton month={month} />
          </div>
        }
      />
      <ReportView report={r} />
    </>
  );
}
