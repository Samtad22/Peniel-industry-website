import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { SectionHead } from "@/components/ops/OpsKit";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate } from "@/lib/format";
import { monthName, previousMonth } from "@/lib/month-report";
import { addDays } from "@/lib/production-math";
import { EXPORTS } from "@/lib/report-exports";
import { opsRolesFor } from "@/lib/roles";

export const metadata: Metadata = { title: "Reports" };

/**
 * Reports (admin only): the end-of-day report, the monthly summary, and
 * downloads of the records as files that open in Excel. No AI or paid service.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaff(opsRolesFor("reports"));
  const sp = await searchParams;
  const today = addisDateISO(new Date());
  const thisMonth = today.slice(0, 7);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && DATE.test(sp.from) ? sp.from : `${previousMonth(today)}-01`;
  const to = sp.to && DATE.test(sp.to) ? sp.to : today;
  const months = [thisMonth];
  for (let i = 0; i < 6; i++) months.push(previousMonth(`${months[months.length - 1]}-01`));
  const tile = "flex flex-col gap-1 border-2 border-text px-4 py-3 text-text no-underline hover:bg-text hover:!text-bg";

  return (
    <>
      <OpsHeader title="Reports" sub="Built from what's logged in the portal · no AI or paid service" actions={<InternalOnly>Internal only · never sent to customers</InternalOnly>} />
      <div className="flex flex-col gap-10 px-4 py-6 sm:px-8">
        <section className="flex flex-col gap-3">
          <SectionHead title="End of day" aside="emailed to admins every evening at about 20:00" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
              const day = addDays(today, -d);
              return (
                <Link key={day} href={`/ops/reports/eod?d=${day}`} className={tile}>
                  <b className="text-[15px]">{d === 0 ? "Today" : d === 1 ? "Yesterday" : formatDate(day)}</b>
                  <span className="text-[12px] opacity-70">{d < 2 ? formatDate(day) : "end of day"}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHead title="Monthly summary" aside="emailed to admins on the 1st, for the month before" />
          <div className="flex flex-wrap gap-2">
            {months.map((m) => (
              <Link key={m} href={`/ops/reports/month?m=${m}`} className={tile}>
                <b className="text-[15px]">{monthName(m)}</b>
                <span className="text-[12px] opacity-70">{m === thisMonth ? "so far" : "full month"}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHead title="Downloads for Excel" aside="CSV files · open them in Excel or Google Sheets" />
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="field">
              <label htmlFor="rp-from">From</label>
              <input id="rp-from" name="from" type="date" defaultValue={from} max={today} className="input min-h-11" />
            </div>
            <div className="field">
              <label htmlFor="rp-to">To</label>
              <input id="rp-to" name="to" type="date" defaultValue={to} max={today} className="input min-h-11" />
            </div>
            <button type="submit" className="btn btn-secondary text-text">
              Set dates
            </button>
          </form>
          <p className="m-0 text-[13px] opacity-75">
            {formatDate(from)} to {formatDate(to)}, both days included.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {EXPORTS.map((e) => (
              <a key={e.kind} href={`/ops/reports/export/${e.kind}?from=${from}&to=${to}`} className={`${tile} !py-4`} download>
                <b className="flex items-center justify-between gap-2 text-[16px]">
                  {e.title} <span aria-hidden="true">↓</span>
                </b>
                <span className="text-[13px] opacity-75">{e.sub}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
