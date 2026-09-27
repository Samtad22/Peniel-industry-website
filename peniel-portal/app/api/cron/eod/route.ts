import { NextResponse, type NextRequest } from "next/server";
import { buildEodReport, eodEmailLines } from "@/lib/eod-report";
import { eodRecipients, loadEodInput } from "@/lib/eod-data";
import { sendEmails } from "@/lib/email";
import { addisDateISO } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The evening end-of-day email to the admins, called by Vercel Cron (vercel.json).
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without that secret set,
 * or with a wrong one, nothing runs. The service role reads the day's records
 * (there is no signed-in user); the email goes to admins only.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const date = addisDateISO(new Date());
  const report = buildEodReport(await loadEodInput(db, date));
  const to = await eodRecipients(db);
  await sendEmails(to, { subject: report.heading, heading: report.heading, lines: eodEmailLines(report), cta: { label: "Open the report", path: `/ops/reports/eod?d=${date}` } }, { kind: "eod_report" });
  return NextResponse.json({ date, sent_to: to.length });
}
