import { formatDate } from "./format.ts";
import { ORDER_STATUS_LABELS, type OrderStatus } from "./order-status.ts";

export type AuditRow = {
  action: string;
  entity: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const label = (s: unknown) => ORDER_STATUS_LABELS[s as OrderStatus] ?? String(s);
const date = (v: unknown) => (v ? formatDate(String(v)) : "none");

/**
 * One line of the order page's activity log (design 1f): what changed and,
 * underneath, the detail that matters. Staff only — this may quote
 * internal notes.
 */
export function describeAudit(r: AuditRow): { what: string; detail: string } {
  const a = r.after ?? {};
  const b = r.before ?? {};

  if (r.entity === "order_attachments") {
    return r.action === "deleted"
      ? { what: "File removed", detail: String(b.file_name ?? "") }
      : { what: "File attached", detail: String(a.file_name ?? "") };
  }

  if (r.action === "created") {
    return { what: "Order submitted", detail: `PO ${a.po_number ?? ""}` };
  }

  const parts: string[] = [];
  let what = "Order updated";
  if (b.status !== a.status) {
    what = `Status: ${label(b.status)} → ${label(a.status)}`;
    if (a.status === "confirmed" && a.confirmed_due_date) parts.push(`Due ${date(a.confirmed_due_date)}`);
  }
  if (b.revised_due_date !== a.revised_due_date) {
    const from = b.revised_due_date ?? b.confirmed_due_date;
    const change = `Due date: ${date(from)} → ${date(a.revised_due_date)}`;
    if (what === "Order updated") what = change;
    else parts.push(change);
  }
  if (a.customer_reason && a.customer_reason !== b.customer_reason) parts.push(`Customer reason: ${a.customer_reason}`);
  if (b.internal_notes !== a.internal_notes) {
    if (what === "Order updated") what = "Internal note updated";
    else parts.push("Internal note updated");
    parts.push("not visible to customer");
  }
  return { what, detail: parts.join(" · ") };
}
