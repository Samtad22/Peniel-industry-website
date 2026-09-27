import { NextResponse, type NextRequest } from "next/server";
import { eodRecipients } from "@/lib/eod-data";
import { sendEmails } from "@/lib/email";
import { addisDateISO } from "@/lib/format";
import { loadMonthInput } from "@/lib/month-data";
import { buildMonthReport, monthEmailLines, previousMonth } from "@/lib/month-report";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The monthly summary email to the admins, for the month before, called by
 * Vercel Cron on the 1st (vercel.json). Needs `Authorization: Bearer
 * $CRON_SECRET`, like the end-of-day email.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const month = previousMonth(addisDateISO(new Date()));
  const r = buildMonthReport(await loadMonthInput(db, month));
  const to = await eodRecipients(db);
  await sendEmails(to, { subject: r.heading, heading: r.heading, lines: monthEmailLines(r), cta: { label: "Open the summary", path: `/ops/reports/month?m=${month}` } }, { kind: "month_report" });
  return NextResponse.json({ month, sent_to: to.length });
}
