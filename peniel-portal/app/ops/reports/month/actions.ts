"use server";

import { requireStaff } from "@/lib/auth";
import { eodRecipients } from "@/lib/eod-data";
import { emailConfigured, sendEmails } from "@/lib/email";
import { loadMonthInput } from "@/lib/month-data";
import { buildMonthReport, monthEmailLines } from "@/lib/month-report";
import { createClient } from "@/lib/supabase/server";

export type MonthState = { error?: string; ok?: string } | null;

/** Email a month's summary to the admins now. */
export async function emailMonthReport(_prev: MonthState, fd: FormData): Promise<MonthState> {
  await requireStaff(["admin"]);
  const month = String(fd.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month." };
  if (!emailConfigured()) return { error: "Email isn't set up on this site (Resend), so nothing was sent." };
  const supabase = await createClient();
  const r = buildMonthReport(await loadMonthInput(supabase, month));
  const to = await eodRecipients(supabase);
  if (to.length === 0) return { error: "No active admin has an email address." };
  await sendEmails(to, { subject: r.heading, heading: r.heading, lines: monthEmailLines(r), cta: { label: "Open the summary", path: `/ops/reports/month?m=${month}` } }, { kind: "month_report" });
  return { ok: `Sent to ${to.length} ${to.length === 1 ? "admin" : "admins"}.` };
}
