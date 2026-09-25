import Link from "next/link";
import ProofCard from "@/components/customer/ProofCard";
import ReplyForm from "@/components/customer/ReplyForm";
import StatusBadge from "@/components/ui/StatusBadge";
import Timeline from "@/components/ui/Timeline";
import { ATTACHMENT_TYPE_LABELS, fileExt, formatBytes } from "@/lib/files";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import type { CustomerOrderDetailData } from "@/lib/customer-orders";

const PROGRESS_STATUSES = ["in_production", "quality_check", "ready_for_pickup", "dispatched", "delivered"];

/**
 * One order for its customer: design 1b's detail panel on wide screens and
 * 1s on phones. Everything here comes from customer_* views.
 */
export default function OrderDetail({ o, variant = "panel" }: { o: CustomerOrderDetailData; variant?: "panel" | "page" }) {
  const pct = o.quantity > 0 ? Math.min(100, Math.round((o.completed_qty / o.quantity) * 100)) : 0;
  const showProgress = o.completed_qty > 0 || PROGRESS_STATUSES.includes(o.status);
  const canReorder = o.status !== "submitted";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h6 className="m-0 text-accent-700">
            {o.order_no} · PO {o.po_number}
          </h6>
          <h3 className="mb-0 mt-1">
            {o.brand_name}
            {o.spec && ` · ${o.spec}`}
          </h3>
          <div className="text-[13px] opacity-70">
            {[o.liner && `${o.liner} liner`, `${o.quantity.toLocaleString("en-US")} crowns`, o.due_date && `due ${formatDate(o.due_date)}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {variant === "panel" && <StatusBadge status={o.status} audience="customer" />}
      </div>

      {o.status === "on_hold" && (
        <div className="flex flex-col gap-1.5 bg-accent-800 px-4 py-3.5 text-bg">
          <span className="flex justify-between gap-3 text-[12px]">
            <b>❚❚ ON HOLD</b>
            <span>Updated {formatDate(o.updated_at)}</span>
          </span>
          {o.customer_reason && <span className="text-[15px]">{o.customer_reason}</span>}
        </div>
      )}
      {o.status === "rejected" && (
        <div className="flex flex-col gap-1.5 border-2 border-accent-800 px-4 py-3.5 text-accent-800">
          <b className="text-[12px]">× NOT ACCEPTED</b>
          {o.customer_reason && <span className="text-[15px]">{o.customer_reason}</span>}
        </div>
      )}
      {o.proofs.map((p) => (
        <ProofCard key={p.id} p={p} />
      ))}

      {o.customer_reason && o.status !== "on_hold" && o.status !== "rejected" && (
        <div className="flex flex-col gap-1 bg-accent-100 px-4 py-3 text-accent-800">
          <b className="text-[12px]">UPDATE FROM PENIEL · {formatDate(o.updated_at)}</b>
          <span className="text-[14px]">{o.customer_reason}</span>
        </div>
      )}
      {o.status === "submitted" && (
        <p className="m-0 bg-neutral-200 px-3.5 py-2.5 text-[13px] text-neutral-800">
          Peniel is checking your order against the PO and will confirm the due date.
        </p>
      )}

      {showProgress && (
        <div className="flex flex-col gap-1.5">
          <div className="relative h-2.5 bg-surface">
            <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[13px]">
            <span>
              {formatQty(o.completed_qty)} of {formatQty(o.quantity)} produced
            </span>
            <b>{pct}%</b>
          </div>
        </div>
      )}

      <section>
        <h6 className="mb-1 mt-0">Progress</h6>
        <Timeline steps={o.steps} />
      </section>

      {(o.messages.length > 0 || o.threadId) && (
        <section className="flex flex-col gap-2">
          <h6 className="m-0">Messages about this order</h6>
          <div className="border-t-2 border-divider">
            {o.messages.map((m) => (
              <div
                key={m.id}
                className={
                  "flex flex-col gap-0.5 border-b border-divider py-2.5 text-[14px] " +
                  (m.from_peniel ? "" : "pl-6")
                }
              >
                <span className="flex justify-between gap-3 text-[12px] opacity-70">
                  <b>{m.from_peniel ? `Peniel · ${m.author_name}` : m.author_name}</b>
                  <span>{formatDateTime(m.created_at)}</span>
                </span>
                <span className="whitespace-pre-line">{m.body}</span>
              </div>
            ))}
          </div>
          {o.threadId && <ReplyForm threadId={o.threadId} />}
        </section>
      )}

      <section>
        <h6 className="mb-1 mt-0">Attachments</h6>
        <div className="border-t-2 border-divider">
          {o.attachments.length === 0 && <p className="m-0 py-2.5 text-[13px] opacity-60">No files attached.</p>}
          {o.attachments.map((f) => (
            <a
              key={f.id}
              href={`/files/attachments/${f.id}`}
              className="grid min-h-12 grid-cols-[40px_minmax(0,1fr)_32px] items-center gap-2.5 border-b border-divider py-2 text-[13px] text-text no-underline hover:bg-text/5 hover:text-text"
            >
              <span className="bg-surface py-[3px] text-center font-mono text-[10px] font-semibold">{fileExt(f.file_name)}</span>
              <span className="min-w-0">
                <b className="block truncate">{f.file_name}</b>
                <span className="opacity-60">
                  {ATTACHMENT_TYPE_LABELS[f.type]} · {formatBytes(f.size_bytes)}
                </span>
              </span>
              <span className="text-center font-extrabold text-accent" aria-label={`Download ${f.file_name}`}>
                ↓
              </span>
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-2">
        {canReorder && (
          <Link href={`/orders/new?reorder=${o.id}`} className="btn btn-secondary btn-split min-h-12 text-text">
            Reorder<span aria-hidden="true">↻</span>
          </Link>
        )}
        {!o.threadId && (
          <Link href={`/messages?new=1&order=${o.id}`} className="btn btn-primary btn-split min-h-12">
            Message Peniel<span aria-hidden="true">→</span>
          </Link>
        )}
        <Link href={`/orders/new?po_from=${o.id}`} className="btn btn-secondary btn-split min-h-12 text-text">
          Order another brand on this PO<span aria-hidden="true">+</span>
        </Link>
      </div>
    </div>
  );
}
