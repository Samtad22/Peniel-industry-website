// The notification email layout, as HTML and plain text. Pure (no server
// imports) so it can be unit-tested; every dynamic value is escaped.

export type EmailContent = {
  subject: string;
  /** Big line at the top of the email. */
  heading: string;
  /** Plain paragraphs. Written for the reader: no internal detail for customers. */
  lines: string[];
  /** Optional highlighted note, e.g. the customer-facing reason for a hold. */
  note?: string | null;
  cta?: { label: string; path: string };
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The email body, in the portal's look, as HTML and plain text. */
export function renderEmail(c: EmailContent, baseUrl: string): { html: string; text: string } {
  const url = c.cta ? `${baseUrl}${c.cta.path}` : null;
  const p = (s: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#201e1d">${esc(s).replace(/\n/g, "<br>")}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f2f2;font-family:Archivo,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-top:4px solid #ec3013">
<tr><td style="padding:20px 28px 0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#ec3013">Peniel Industry PLC</td></tr>
<tr><td style="padding:8px 28px 4px;font-size:22px;font-weight:800;line-height:1.25;color:#201e1d">${esc(c.heading)}</td></tr>
<tr><td style="padding:12px 28px 4px">${c.lines.map(p).join("")}${
    c.note
      ? `<div style="margin:4px 0 16px;padding:12px 14px;background:#fdece8;color:#7a1a0c;font-size:15px;line-height:1.5">${esc(c.note).replace(/\n/g, "<br>")}</div>`
      : ""
  }${
    url
      ? `<p style="margin:8px 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#ec3013;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 18px">${esc(c.cta!.label)} &rarr;</a></p>`
      : ""
  }</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #e3e1e0;font-size:12px;line-height:1.5;color:#6b6866">Peniel Industry PLC · Bole Lemi Industrial Park, Addis Ababa<br>You get this email because you have an account on the Peniel portal.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.heading, "", ...c.lines, ...(c.note ? ["", c.note] : []), ...(url ? ["", `${c.cta!.label}: ${url}`] : []), "", "Peniel Industry PLC · Bole Lemi Industrial Park, Addis Ababa"].join("\n");
  return { html, text };
}

