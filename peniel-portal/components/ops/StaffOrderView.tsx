import Link from "next/link";
import { Lock } from "lucide-react";
import { OpsTopBar } from "@/components/ops/OpsHeader";
import { NotesForm, StaffReplyForm, StatusControl, type Preset } from "@/components/ops/OrderForms";
import StatusBadge from "@/components/ui/StatusBadge";
import Timeline from "@/components/ui/Timeline";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { ATTACHMENT_TYPE_LABELS, fileExt, formatBytes } from "@/lib/files";
import { formatDateTime, formatDayMonth, formatQty } from "@/lib/format";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { cartonsOf, formatCartons, rejectPctAfterSorting } from "@/lib/sorting";
import type { StaffOrder } from "@/lib/staff-orders";

export function AttachmentList({ files }: { files: StaffOrder["attachments"] }) {
  return (
    <div className="border-t-2 border-divider text-[13px]">
      {files.length === 0 && <p className="m-0 py-2 opacity-60">No files.</p>}
      {files.map((f) => (
        <a
          key={f.id}
          href={`/files/attachments/${f.id}`}
          className="grid grid-cols-[40px_minmax(0,1fr)_24px] items-center gap-2.5 border-b border-divider py-2 text-text no-underline hover:bg-text/5 hover:text-text"
        >
          <span className="bg-surface py-[3px] text-center font-mono text-[10px] font-semibold">{fileExt(f.file_name)}</span>
          <span className="min-w-0">
            <b className="block truncate">{f.file_name}</b>
            <span className="opacity-60">
              {ATTACHMENT_TYPE_LABELS[f.type]} · {formatBytes(f.size_bytes)}
            </span>
          </span>
          <span aria-label={`Download ${f.file_name}`}>↓</span>
        </a>
      ))}
    </div>
  );
}

export function Conversation({ o, canEdit }: { o: StaffOrder; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="border-t-2 border-divider">
        {o.messages.length === 0 && <p className="m-0 py-2 text-[13px] opacity-60">No messages about this order yet.</p>}
        {o.messages.map((m) => (
          <div
            key={m.id}
            className={
              "flex flex-col gap-0.5 border-b border-divider py-2 text-[13px] " + (m.from_customer ? "" : "pl-5")
            }
          >
            <span className="flex justify-between gap-2 text-[12px] opacity-70">
              <b>{m.from_customer ? `${m.author} (customer)` : m.author}</b>
              <span>{formatDateTime(m.created_at)}</span>
            </span>
            <span className="whitespace-pre-line">{m.body}</span>
          </div>
        ))}
      </div>
      {canEdit && <StaffReplyForm orderId={o.id} />}
    </div>
  );
}

/** The status track across the order page (design 2d). */
const TRACK: OrderStatus[] = [
  "submitted",
  "confirmed",
  "awaiting_approval",
  "scheduled",
  "in_production",
  "quality_check",
  "ready_for_pickup",
  "dispatched",
  "delivered",
  "on_hold",
];

/** Staff order page, v2 (design 2d). */
export default function StaffOrderView({
  o,
  canEdit,
  holdPresets,
  rejectPresets,
  minDate,
}: {
  o: StaffOrder;
  canEdit: boolean;
  holdPresets: Preset[];
  rejectPresets: Preset[];
  minDate: string;
}) {
  const p = o.production;
  const current = TRACK.indexOf(o.status);
  const revised = o.revised_due_date && o.confirmed_due_date && o.revised_due_date !== o.confirmed_due_date;
  return (
    <>
      <OpsTopBar current={o.order_no}>
        <StatusBadge status={o.status} />
        <Link href={`/ops/orders/${o.id}/preview`} target="_blank" className="btn btn-secondary text-text">
          Preview as customer ↗
        </Link>
      </OpsTopBar>

      <div className="grid items-end gap-6 px-4 pb-[22px] pt-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h1 className="m-0 break-words text-[52px] leading-[.85] tracking-[-.05em] sm:text-[88px]">{o.order_no}</h1>
          <div className="mt-3 text-[15px] sm:text-[16px]">
            <b>{o.company}</b> ·{" "}
            {[`${o.brand}`, `${o.quantity.toLocaleString("en-US")} × ${[o.spec, o.liner].filter(Boolean).join(" · ")}`, `PO ${o.po_number}`].join(" · ")}
          </div>
          <div className="mt-1 text-[13px] opacity-70">
            {o.delivery_method === "delivery" ? `Delivery to ${o.delivery_address ?? "-"}` : "Pickup at Bole Lemi"}
          </div>
        </div>
        <div className="flex flex-col gap-1 lg:items-end">
          <span className="font-mono text-[11px] font-semibold tracking-[.1em] opacity-60">DUE DATE</span>
          <span className="text-[32px] font-extrabold leading-none tracking-[-.03em] sm:text-[40px]">
            {revised && <s className="mr-2 text-[22px] opacity-35">{formatDayMonth(o.confirmed_due_date)}</s>}
            {o.due_date ? formatDayMonth(o.due_date) : "Not set"}
          </span>
        </div>
      </div>

      <ol className="m-0 grid list-none grid-cols-2 border-y-2 border-text p-0 sm:grid-cols-5 xl:grid-cols-10" aria-label="Order status">
        {TRACK.map((st, i) => {
          const now = st === o.status;
          return (
            <li
              key={st}
              aria-current={now ? "step" : undefined}
              className={`flex flex-col gap-1 border-divider px-3 py-3 text-[13px] max-sm:[&:nth-child(even)]:border-l sm:[&:not(:nth-child(5n+1))]:border-l xl:[&:not(:first-child)]:border-l ${
                now
                  ? st === "on_hold"
                    ? "bg-accent-800 font-extrabold text-bg"
                    : "bg-text font-extrabold text-bg"
                  : current >= 0 && o.status !== "on_hold" && i < current
                    ? "bg-surface"
                    : "opacity-55"
              }`}
            >
              <span className="font-mono text-[10px] font-semibold opacity-60">{String(i + 1).padStart(2, "0")}</span>
              <span>{ORDER_STATUS_LABELS[st]}</span>
            </li>
          );
        })}
      </ol>
      {o.status === "rejected" && <p className="m-0 bg-accent-100 px-4 py-2.5 text-[13px] font-extrabold text-accent-800 sm:px-8">This order was rejected.</p>}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[18px] px-4 py-6 sm:px-8 xl:border-r-2 xl:border-divider">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[26px] sm:text-[30px]">Change status</h2>
            <CustomerSees />
          </div>
          {canEdit ? (
            <StatusControl
              orderId={o.id}
              orderNo={o.order_no}
              status={o.status}
              due={o.due_date}
              holdPresets={holdPresets}
              rejectPresets={rejectPresets}
              minDate={minDate}
              stock={{
                quantity: o.stock.quantity,
                batches: o.stock.batches,
                // Good crowns produced so far, else the ordered quantity; released batches, else the order number.
                suggestedQty: Math.max(0, o.production.produced - o.production.rejects - o.stock.quantity) || (o.stock.quantity ? 0 : o.quantity),
                suggestedBatch:
                  o.production.batches.filter((b) => b.result === "released").map((b) => b.batch_no).join(", ") ||
                  o.production.batches.at(-1)?.batch_no ||
                  o.order_no,
              }}
            />
          ) : (
            <p className="m-0 bg-neutral-200 px-3.5 py-3 text-[13px]">
              Only Sales and Admin change order status. You can read everything here.
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h5 className="m-0">
                  <a href={`/ops/production/${o.id}`} className="text-text">
                    Linked production records →
                  </a>
                </h5>
                <InternalOnly />
              </div>
              <div className="border-t-2 border-divider text-[13px]">
                {p.entries === 0 ? (
                  <div className="border-b border-divider py-2 opacity-60">No production entries yet</div>
                ) : (
                  <>
                    <div className="border-b border-divider py-2">
                      {p.entries} entries · {formatQty(p.produced)} produced · {formatQty(p.rejects)} camera rejects
                    </div>
                    <div className="border-b border-divider py-2">
                      {p.sorting.reports ? (
                        <>
                          Sorted {p.sorting.passed + p.sorting.waste} of {formatCartons(cartonsOf(p.rejects))} cartons: {p.sorting.passed} passed,{" "}
                          {p.sorting.waste} waste · reject rate after sorting{" "}
                          <b>{p.produced ? `${rejectPctAfterSorting(p.produced, p.sorting.waste)?.toFixed(2)}%` : "-"}</b>
                        </>
                      ) : (
                        <span className="opacity-60">
                          {p.rejects ? `${formatCartons(cartonsOf(p.rejects))} cartons of camera rejects, not sorted yet` : "No camera rejects to sort"}
                        </span>
                      )}{" "}
                      ·{" "}
                      <Link href="/ops/quality#sorting" className="text-text">
                        Sorting
                      </Link>
                    </div>
                    <div className="border-b border-divider py-2">Lines: {p.lines.join(", ") || "-"}</div>
                  </>
                )}
                {p.batches.length === 0 ? (
                  <div className="py-2 opacity-60">No batches yet</div>
                ) : (
                  p.batches.map((b) => (
                    <div key={b.batch_no} className="border-b border-divider py-2">
                      Batch {b.batch_no} · {b.result === "on_hold" ? "held" : (b.result ?? "not reviewed")}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h5 className="mb-1.5 mt-0">Attachments</h5>
              <AttachmentList files={o.attachments} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[18px] bg-surface px-4 py-6 sm:px-8">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h5 className="m-0">Messages with the customer</h5>
              <CustomerSees />
            </div>
            <Conversation o={o} canEdit={canEdit} />
          </div>
          <div>
            <h5 className="mb-1.5 mt-0">Timeline</h5>
            <Timeline steps={o.steps} tone="staff" />
          </div>
          <div className="internal-ground flex flex-col gap-2.5 border-2 border-neutral-400 p-[18px]">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[.1em]">
              <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
              INTERNAL · NEVER VISIBLE TO CUSTOMERS
            </span>
            <NotesForm orderId={o.id} notes={o.internal_notes ?? ""} canEdit={canEdit} />
            <div className="bg-bg px-3 py-1">
              <h6 className="mb-0 mt-2 opacity-60">Activity log</h6>
              {o.activity.length === 0 && <p className="m-0 py-2 text-[12px] opacity-60">No activity recorded.</p>}
              {o.activity.map((a, i) => (
                <div key={i} className="flex flex-col gap-0.5 border-b border-divider py-2 text-[12px]">
                  <span className="flex justify-between gap-3">
                    <b>{a.what}</b>
                    <span className="shrink-0 opacity-60">{formatDateTime(a.when)}</span>
                  </span>
                  <span className="opacity-75">
                    {a.who}
                    {a.detail && ` · ${a.detail}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
