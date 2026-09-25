import "server-only";
import { after } from "next/server";
import { sendEmails, type EmailContent } from "@/lib/email";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import type { StaffRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

// Notification emails (docs/PORTAL_SPEC.md §4). Each function is called
// after a successful action and runs once the response has been sent, so
// email never slows down or breaks the action.
//
// The service role is used only to look up recipients and the few fields an
// email needs. Emails to customers carry customer-facing fields only
// (CLAUDE.md rule 2): never internal notes, lines, locations or measurements.

type Admin = ReturnType<typeof createAdminClient>;

async function customerEmails(db: Admin, companyId: string): Promise<string[]> {
  const { data } = await db
    .from("profiles")
    .select("email")
    .eq("company_id", companyId)
    .eq("role", "customer_user")
    .eq("active", true);
  return (data ?? []).map((p) => p.email).filter(Boolean);
}

async function staffEmails(db: Admin, roles: StaffRole[], userIds: string[] = []): Promise<string[]> {
  const { data } = await db.from("profiles").select("email, role, user_id").eq("active", true).neq("role", "customer_user");
  return (data ?? []).filter((p) => roles.includes(p.role) || userIds.includes(p.user_id)).map((p) => p.email).filter(Boolean);
}

type OrderInfo = {
  id: string;
  order_no: string;
  company_id: string;
  po_number: string;
  quantity: number;
  status: OrderStatus;
  customer_reason: string | null;
  confirmed_due_date: string | null;
  revised_due_date: string | null;
  companies: { name: string } | null;
  brands: { name: string } | null;
};

async function loadOrder(db: Admin, id: string): Promise<OrderInfo | null> {
  const { data } = await db
    .from("orders")
    .select("id, order_no, company_id, po_number, quantity, status, customer_reason, confirmed_due_date, revised_due_date, companies(name), brands(name)")
    .eq("id", id)
    .maybeSingle<OrderInfo>();
  return data;
}

function run(task: (db: Admin) => Promise<void>) {
  after(async () => {
    try {
      await task(createAdminClient());
    } catch (e) {
      console.error("notification failed", (e as Error).message);
    }
  });
}

const qty = (n: number) => Number(n).toLocaleString("en-US");
const filesLine = (n: number) => (n > 0 ? [`${n} ${n === 1 ? "file" : "files"} attached. Open the portal to download.`] : []);

// ---------------------------------------------------------------------------
// To customers
// ---------------------------------------------------------------------------

/** Status changes the customer is emailed about. */
const CUSTOMER_STATUSES: OrderStatus[] = ["confirmed", "on_hold", "rejected", "ready_for_pickup", "dispatched"];

/** Order confirmed, put on hold, rejected, ready, dispatched — or its due date changed. */
export function notifyOrderUpdate(orderId: string, opts: { dateChanged?: boolean } = {}) {
  run(async (db) => {
    const o = await loadOrder(db, orderId);
    if (!o) return;
    if (!CUSTOMER_STATUSES.includes(o.status) && !opts.dateChanged) return;
    const due = o.revised_due_date ?? o.confirmed_due_date;
    const brand = o.brands?.name ?? "";
    const what = `${brand} · ${qty(o.quantity)} crowns · PO ${o.po_number}`;
    const byStatus: Partial<Record<OrderStatus, Pick<EmailContent, "subject" | "heading" | "lines">>> = {
      confirmed: {
        subject: `Order ${o.order_no} confirmed`,
        heading: `Your order ${o.order_no} is confirmed`,
        lines: [what, `Due date: ${formatDate(due)}.`],
      },
      on_hold: {
        subject: `Order ${o.order_no} is on hold`,
        heading: `Your order ${o.order_no} is on hold`,
        lines: [what, ...(due ? [`Due date: ${formatDate(due)}.`] : [])],
      },
      rejected: {
        subject: `Order ${o.order_no} was not accepted`,
        heading: `We couldn't accept order ${o.order_no}`,
        lines: [what],
      },
      ready_for_pickup: {
        subject: `Order ${o.order_no} is ready for pickup`,
        heading: `Order ${o.order_no} is ready for pickup`,
        lines: [what, "You can book a pickup time in the portal under Production → Stock."],
      },
      dispatched: {
        subject: `Order ${o.order_no} has been dispatched`,
        heading: `Order ${o.order_no} is on its way`,
        lines: [what],
      },
    };
    const base = CUSTOMER_STATUSES.includes(o.status) && byStatus[o.status]
      ? byStatus[o.status]!
      : {
          subject: `New due date for order ${o.order_no}`,
          heading: `Order ${o.order_no} has a new due date`,
          lines: [what, `New due date: ${formatDate(due)}. Status: ${ORDER_STATUS_LABELS[o.status]}.`],
        };
    if (opts.dateChanged && o.status !== "confirmed" && byStatus[o.status] && o.status !== "rejected") {
      base.lines = [...base.lines.filter((l) => !l.startsWith("Due date")), `New due date: ${formatDate(due)}.`];
    }
    await sendEmails(
      await customerEmails(db, o.company_id),
      { ...base, note: o.customer_reason, cta: { label: "View order", path: `/orders/${o.id}` } },
      { kind: `order_${o.status}${opts.dateChanged ? "_date" : ""}`, companyId: o.company_id, entityId: o.id },
    );
  });
}

export function notifyProofSent(proofId: string) {
  run(async (db) => {
    const { data: p } = await db
      .from("proofs")
      .select("id, version, note, approve_by, brands(name, company_id), orders(order_no)")
      .eq("id", proofId)
      .maybeSingle<{ id: string; version: number | null; note: string | null; approve_by: string | null; brands: { name: string; company_id: string } | null; orders: { order_no: string } | null }>();
    if (!p?.brands) return;
    await sendEmails(
      await customerEmails(db, p.brands.company_id),
      {
        subject: `Artwork proof ${p.version ? `v${p.version} ` : ""}for ${p.brands.name} is ready for your approval`,
        heading: `Please review proof ${p.version ? `v${p.version}` : ""} for ${p.brands.name}`,
        lines: [
          ...(p.orders ? [`For order ${p.orders.order_no}.`] : []),
          ...(p.approve_by ? [`Please answer by ${formatDate(p.approve_by)} to keep your due date.`] : []),
        ],
        note: p.note,
        cta: { label: "Review the proof", path: "/artwork" },
      },
      { kind: "proof_sent", companyId: p.brands.company_id, entityId: p.id },
    );
  });
}

export function notifyDocumentShared(documentId: string) {
  run(async (db) => {
    const { data: d } = await db
      .from("documents")
      .select("id, title, visibility, company_id, orders(order_no)")
      .eq("id", documentId)
      .maybeSingle<{ id: string; title: string; visibility: string; company_id: string; orders: { order_no: string } | null }>();
    if (!d || d.visibility !== "customer") return;
    await sendEmails(
      await customerEmails(db, d.company_id),
      {
        subject: `New document from Peniel: ${d.title}`,
        heading: "Peniel shared a document with you",
        lines: [`${d.title}${d.orders ? ` (order ${d.orders.order_no})` : ""}`],
        cta: { label: "Open Documents", path: "/documents" },
      },
      { kind: "document_shared", companyId: d.company_id, entityId: d.id },
    );
  });
}

/** Peniel wrote to the customer (never called for internal notes). */
export function notifyMessageToCustomer(threadId: string, body: string, files = 0) {
  run(async (db) => {
    const { data: t } = await db
      .from("message_threads")
      .select("id, subject, company_id")
      .eq("id", threadId)
      .maybeSingle<{ id: string; subject: string; company_id: string }>();
    if (!t) return;
    await sendEmails(
      await customerEmails(db, t.company_id),
      {
        subject: `New message from Peniel: ${t.subject}`,
        heading: "You have a new message from Peniel",
        lines: [t.subject, ...filesLine(files)],
        note: body.length > 600 ? `${body.slice(0, 600)}…` : body,
        cta: { label: "Reply in the portal", path: `/messages?t=${t.id}` },
      },
      { kind: "message_to_customer", companyId: t.company_id, entityId: t.id },
    );
  });
}

// ---------------------------------------------------------------------------
// To staff
// ---------------------------------------------------------------------------

export function notifyOrderSubmitted(orderId: string) {
  run(async (db) => {
    const o = await loadOrder(db, orderId);
    if (!o) return;
    await sendEmails(
      await staffEmails(db, ["admin", "sales"]),
      {
        subject: `New order ${o.order_no} from ${o.companies?.name ?? "a customer"}`,
        heading: `New order ${o.order_no}`,
        lines: [`${o.companies?.name ?? ""} · ${o.brands?.name ?? ""} · ${qty(o.quantity)} crowns · PO ${o.po_number}`],
        cta: { label: "Open the order inbox", path: `/ops/inbox?o=${o.id}` },
      },
      { kind: "order_submitted", companyId: o.company_id, entityId: o.id },
    );
  });
}

export function notifyProofAnswered(proofId: string) {
  run(async (db) => {
    const { data: p } = await db
      .from("proofs")
      .select("id, version, status, customer_comment, sent_by, brands(name, company_id, companies(name)), responder:profiles!proofs_responded_by_fkey(full_name)")
      .eq("id", proofId)
      .maybeSingle<{
        id: string;
        version: number | null;
        status: string;
        customer_comment: string | null;
        sent_by: string | null;
        brands: { name: string; company_id: string; companies: { name: string } | null } | null;
        responder: { full_name: string } | null;
      }>();
    if (!p?.brands) return;
    const approved = p.status === "approved";
    await sendEmails(
      await staffEmails(db, ["admin", "sales"], p.sent_by ? [p.sent_by] : []),
      {
        subject: `${p.brands.companies?.name ?? "Customer"} ${approved ? "approved" : "requested changes to"} proof v${p.version ?? "?"} for ${p.brands.name}`,
        heading: approved ? `Proof approved: ${p.brands.name} v${p.version ?? "?"}` : `Changes requested: ${p.brands.name} v${p.version ?? "?"}`,
        lines: [`${p.responder?.full_name ?? "The customer"} · ${p.brands.companies?.name ?? ""}`],
        note: p.customer_comment,
        cta: { label: "Open Artwork", path: "/ops/artwork" },
      },
      { kind: approved ? "proof_approved" : "proof_changes_requested", companyId: p.brands.company_id, entityId: p.id },
    );
  });
}

export function notifyPickupRequested(bookingId: string) {
  run(async (db) => {
    const { data: b } = await db
      .from("pickup_bookings")
      .select("id, requested_at, customer_note, company_id, companies(name)")
      .eq("id", bookingId)
      .maybeSingle<{ id: string; requested_at: string; customer_note: string | null; company_id: string; companies: { name: string } | null }>();
    if (!b) return;
    await sendEmails(
      await staffEmails(db, ["admin", "warehouse"]),
      {
        subject: `Pickup requested by ${b.companies?.name ?? "a customer"}`,
        heading: "New pickup request",
        lines: [`${b.companies?.name ?? ""} would like to collect on ${formatDate(b.requested_at)}.`],
        note: b.customer_note,
        cta: { label: "Open pickups", path: "/ops/inventory/pickups" },
      },
      { kind: "pickup_requested", companyId: b.company_id, entityId: b.id },
    );
  });
}

/** A customer wrote to Peniel: the assigned person, or Sales and Admin. */
export function notifyMessageToStaff(threadId: string, body: string, files = 0) {
  run(async (db) => {
    const { data: t } = await db
      .from("message_threads")
      .select("id, subject, company_id, assigned_to, companies(name)")
      .eq("id", threadId)
      .maybeSingle<{ id: string; subject: string; company_id: string; assigned_to: string | null; companies: { name: string } | null }>();
    if (!t) return;
    const to = t.assigned_to ? await staffEmails(db, [], [t.assigned_to]) : await staffEmails(db, ["admin", "sales"]);
    await sendEmails(
      to,
      {
        subject: `New message from ${t.companies?.name ?? "a customer"}: ${t.subject}`,
        heading: `${t.companies?.name ?? "A customer"} sent a message`,
        lines: [t.subject, ...filesLine(files)],
        note: body.length > 600 ? `${body.slice(0, 600)}…` : body,
        cta: { label: "Open Messages", path: `/ops/messages?t=${t.id}` },
      },
      { kind: "message_to_staff", companyId: t.company_id, entityId: t.id },
    );
  });
}
