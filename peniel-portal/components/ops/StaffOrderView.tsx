import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { NotesForm, StaffReplyForm, StatusControl, type Preset } from "@/components/ops/OrderForms";
import StatusBadge from "@/components/ui/StatusBadge";
import Timeline from "@/components/ui/Timeline";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { ATTACHMENT_TYPE_LABELS, fileExt, formatBytes } from "@/lib/files";
import { formatDateTime, formatQty } from "@/lib/format";
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

/** Staff order page — design 1f. */
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
  return (
    <>
      <OpsHeader
        crumb={{ label: "Orders", href: "/ops/orders", current: o.order_no }}
        title={`${o.company} · ${o.brand} · ${o.quantity.toLocaleString("en-US")}`}
        sub={[
          `PO ${o.po_number}`,
          o.spec,
          o.liner,
          o.delivery_method === "delivery" ? `Delivery to ${o.delivery_address ?? "—"}` : "Pickup at Bole Lemi",
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={o.status} />
            <Link href={`/ops/orders/${o.id}/preview`} target="_blank" className="btn btn-secondary text-text">
              Preview as customer ↗
            </Link>
          </div>
        }
      />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-[18px] px-4 py-6 sm:px-8 xl:border-r-2 xl:border-divider">
          <div className="flex items-center justify-between gap-3">
            <h4 className="m-0">Status</h4>
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
                      {p.entries} entries · {formatQty(p.produced)} produced · {formatQty(p.rejects)} rejects
                    </div>
                    <div className="border-b border-divider py-2">Lines: {p.lines.join(", ") || "—"}</div>
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

        <div className="flex flex-col gap-[18px] bg-surface px-4 py-6 sm:px-8 xl:pl-6">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h5 className="m-0">Internal notes</h5>
              <span className="bg-text px-1.5 py-0.5 text-[10px] font-semibold text-bg">Never visible to customers</span>
            </div>
            <NotesForm orderId={o.id} notes={o.internal_notes ?? ""} canEdit={canEdit} />
          </div>
          <div>
            <h5 className="mb-1.5 mt-0">Timeline</h5>
            <Timeline steps={o.steps} tone="staff" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h5 className="m-0">Messages with the customer</h5>
              <CustomerSees />
            </div>
            <Conversation o={o} canEdit={canEdit} />
          </div>
          <div>
            <h5 className="mb-1.5 mt-0">Activity log</h5>
            <div className="border-t-2 border-divider">
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
