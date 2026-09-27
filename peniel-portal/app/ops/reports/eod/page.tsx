import type { Metadata } from "next";
import Link from "next/link";
import EodEmailButton from "@/components/ops/EodEmailButton";
import OpsHeader from "@/components/ops/OpsHeader";
import { InternalPanel, KpiStrip, SectionHead } from "@/components/ops/OpsKit";
import { requireStaff } from "@/lib/auth";
import { buildEodReport } from "@/lib/eod-report";
import { loadEodInput } from "@/lib/eod-data";
import { addisDateISO } from "@/lib/format";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "End of day report" };

/**
 * The end-of-day report (admin only): what was logged on one day, and what
 * still looks missing. The same report is emailed to the admins every evening
 * (app/api/cron/eod); print it or save it as a PDF from here.
 */
export default async function EodReportPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireStaff(opsRolesFor("reports"));
  const sp = await searchParams;
  const today = addisDateISO(new Date());
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && sp.d <= today ? sp.d : today;
  const supabase = await createClient();
  const r = buildEodReport(await loadEodInput(supabase, date));
  const dayLink = (d: string, label: string) => (
    <Link href={`/ops/reports/eod?d=${d}`} className="btn btn-secondary text-text no-underline">
      {label}
    </Link>
  );

  return (
    <>
      <OpsHeader
        crumb={{ label: "Reports", href: "/ops/reports", current: "End of day" }}
        title="End of day report"
        sub={`${r.heading.replace("End of day report · ", "")} · emailed to admins every evening at about 20:00`}
        actions={
          <div className="flex flex-wrap items-start gap-2 print:hidden">
            {dayLink(addDays(date, -1), "← Day before")}
            {date < today && dayLink(addDays(date, 1), "Next day →")}
            <a href={`/reports/eod?d=${date}&print=1`} target="_blank" rel="noreferrer" className="btn btn-primary btn-split no-underline">
              Print / Save as PDF
              <span aria-hidden="true">⎙</span>
            </a>
            <EodEmailButton date={date} />
          </div>
        }
      />
      <KpiStrip items={r.kpis} />
      <div className="flex flex-col gap-8 px-4 py-6 sm:px-8">
        <InternalPanel label="CHECK BEFORE CLOSING THE DAY">
          {r.checks.length === 0 ? (
            <p className="m-0 text-[14px] font-extrabold">Everything looks logged.</p>
          ) : (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px]">
              {r.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </InternalPanel>
        <div className="grid gap-8 lg:grid-cols-2 print:grid-cols-1">
          {r.sections.map((s) => (
            <section key={s.title} className="flex min-w-0 flex-col gap-3 break-inside-avoid">
              <SectionHead title={s.title} />
              <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
                {s.lines.map((l, i) => (
                  <li key={i} className={`border-b border-divider py-2 ${i === 0 ? "font-extrabold" : ""}`}>
                    {l}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
