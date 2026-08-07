import { NextResponse } from "next/server";
import { Resend } from "resend";
import { COMPANY } from "@/lib/constants";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || !body.name || !body.email || !body.message) {
    return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }

  const { name, company, email, phone, productType, volume, location, message } = body;

  // ---------------------------------------------------------------------
  // Email delivery via Resend (https://resend.com). Requires:
  //   1. RESEND_API_KEY in your environment (.env.local locally, or your
  //      hosting provider's env var settings in production)
  //   2. A verified sending domain in Resend, used as `from` below
  //   3. QUOTE_NOTIFY_EMAIL set to where requests should land (defaults
  //      to info@penielindustry.org if unset)
  //
  // Until RESEND_API_KEY is set, this still validates the request and
  // logs it server-side so the frontend flow works end to end — it just
  // won't actually deliver an email yet.
  // ---------------------------------------------------------------------
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.QUOTE_NOTIFY_EMAIL || COMPANY.email;

  if (!apiKey) {
    console.log("Quote request received (RESEND_API_KEY not set — logging only):", body);
    return NextResponse.json({ ok: true });
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: `${COMPANY.legalName} Website <quotes@${process.env.RESEND_SENDING_DOMAIN || "example.com"}>`,
      to: notifyEmail,
      replyTo: email,
      subject: `New quote request from ${name}${company ? ` (${company})` : ""}`,
      text: [
        `Name: ${name}`,
        company ? `Company: ${company}` : null,
        `Email: ${email}`,
        phone ? `Phone: ${phone}` : null,
        productType ? `Product type: ${productType}` : null,
        volume ? `Estimated volume: ${volume}` : null,
        location ? `Location: ${location}` : null,
        "",
        "Message:",
        message,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to send quote email:", err);
    return NextResponse.json({ ok: false, error: "Email delivery failed." }, { status: 502 });
  }
}
