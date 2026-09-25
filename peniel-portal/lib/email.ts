import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmail, type EmailContent } from "@/lib/email-template";
import { siteUrl } from "@/lib/supabase/env";

export type { EmailContent };

// Transactional email through Resend's HTTP API (no extra package).
// Off until RESEND_API_KEY and EMAIL_FROM are set: emails are then logged as
// "skipped" and nothing else changes.

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Send one email to each recipient separately (nobody sees anyone else's
 * address) and log the outcome. Never throws: a failed email must not undo
 * or block the action that caused it.
 */
export async function sendEmails(
  recipients: string[],
  content: EmailContent,
  meta: { kind: string; companyId?: string | null; entityId?: string | null },
): Promise<void> {
  const to = [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)))];
  if (to.length === 0) return;
  const { html, text } = renderEmail(content, siteUrl());
  const log = createAdminClient();

  for (const recipient of to) {
    let status: "sent" | "failed" | "skipped" = "skipped";
    let error: string | null = emailConfigured() ? null : "Email is not set up (RESEND_API_KEY / EMAIL_FROM)";
    if (emailConfigured()) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [recipient], subject: content.subject, html, text }),
        });
        if (res.ok) status = "sent";
        else {
          status = "failed";
          error = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
        }
      } catch (e) {
        status = "failed";
        error = (e as Error).message.slice(0, 300);
      }
    }
    if (status === "failed") console.error("notification email failed", meta.kind, error);
    await log.from("notification_log").insert({
      kind: meta.kind,
      recipient,
      subject: content.subject,
      status,
      error,
      company_id: meta.companyId ?? null,
      entity_id: meta.entityId ?? null,
    });
  }
}
