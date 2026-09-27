"use server";

import { requireStaff } from "@/lib/auth";
import { buildEodReport, eodEmailLines } from "@/lib/eod-report";
import { eodRecipients, loadEodInput } from "@/lib/eod-data";
import { emailConfigured, sendEmails } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export type EodState = { error?: string; ok?: string } | null;

/** Email the report for a day to the admins now (e.g. once everything is logged). */
export async function emailEodReport(_prev: EodState, fd: FormData): Promise<EodState> {
  await requireStaff(["admin"]);
  const date = String(fd.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a day." };
  if (!emailConfigured()) return { error: "Email isn't set up on this site (Resend), so nothing was sent." };
  const supabase = await createClient();
  const report = buildEodReport(await loadEodInput(supabase, date));
  const to = await eodRecipients(supabase);
  if (to.length === 0) return { error: "No active admin has an email address." };
  await sendEmails(to, { subject: report.heading, heading: report.heading, lines: eodEmailLines(report), cta: { label: "Open the report", path: `/ops/reports/eod?d=${date}` } }, { kind: "eod_report" });
  return { ok: `Sent to ${to.length} ${to.length === 1 ? "admin" : "admins"}.` };
}
