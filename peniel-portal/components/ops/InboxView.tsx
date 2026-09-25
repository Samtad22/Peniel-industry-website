import Link from "next/link";
import { AskDialog, ConfirmForm, RejectDialog, type Preset } from "@/components/ops/OrderForms";
import { AttachmentList, Conversation } from "@/components/ops/StaffOrderView";
import { formatBytes } from "@/lib/files";
import { formatDate, formatDayMonth, formatQty, timeAgo } from "@/lib/format";
import type { StaffOrder } from "@/lib/staff-orders";

export type InboxRow = {
  id: string;
  company: string;
  brand: string;
  spec: string;
  po_number: string;
  quantity: number;
  requested_date: string | null;
  created_at: string;
};

function PoPreview({ o }: { o: StaffOrder }) {
  const po = o.attachments.find((f) => f.type === "purchase_order") ?? o.attachments[0];
  if (!po) {
    return <p className="m-0 text-[13px] text-bg">No files were attached to this order.</p>;
  }
  const src = `/files/attachments/${po.id}?inline=1`;
  const isPdf = po.mime_type === "application/pdf";
  const isImage = po.mime_type.startsWith("image/");
  return (
    <>
      <div className="flex justify-between gap-2 text-[12px] text-bg">
        <b className="truncate">{po.file_name}</b>
        <span className="shrink-0">
          {formatBytes(po.size_bytes)} ·{" "}
          <a href={src} target="_blank" rel="noreferrer" className="text-bg underline">
            Open ↗
          </a>
        </span>
      </div>
      {isPdf ? (
        <iframe src={src} loading="lazy" title={`Preview of ${po.file_name}`} className="h-[640px] w-full border-0 bg-white shadow-lg" />
      ) : isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} loading="lazy" alt={`Purchase order ${po.file_name}`} className="w-full bg-white shadow-lg" />
      ) : (
        <p className="m-0 bg-white p-6 text-[13px] text-text">
          This file type can&apos;t be previewed. <a href={`/files/attachments/${po.id}`}>Download {po.file_name}</a>
        </p>
      )}
      <div className="text-[11px] text-bg opacity-80">Check the PO against the order before you confirm.</div>
    </>
  );
}

/** Order inbox — design 1c, with the reject dialog (1d). */
export default function InboxView({
  rows,
  selected,
  rejectPresets,
  minDate,
  now,
}: {
  rows: InboxRow[];
  selected: StaffOrder | null;
  rejectPresets: Preset[];
  minDate: string;
  now: string;
}) {
  const at = new Date(now);
  const o = selected;
  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
      <div className="border-divider lg:border-r-2">
        <div className="border-b-2 border-divider px-6 py-5">
          <h3 className="m-0">Order inbox</h3>
          <div className="text-[12px] opacity-70">
            {rows.length} submitted · awaiting confirmation
          </div>
        </div>
        {rows.length === 0 && <p className="m-0 px-6 py-4 text-[14px] opacity-70">No new orders. Everything is confirmed.</p>}
        {rows.map((r) => {
          const on = r.id === o?.id;
          return (
            <Link
              key={r.id}
              href={`/ops/inbox?o=${r.id}`}
              scroll={false}
              aria-current={on ? "true" : undefined}
              className={
                "flex flex-col gap-1 border-b border-divider px-6 py-3.5 text-[14px] text-text no-underline hover:text-text " +
                (on ? "bg-neutral-200 shadow-[inset_4px_0_0_var(--color-accent)]" : "hover:bg-text/5")
              }
            >
              <span className="flex justify-between gap-2">
                <b className="truncate">{r.company}</b>
                <span className="shrink-0 text-[12px] opacity-70">{timeAgo(r.created_at, at)}</span>
              </span>
              <span className="text-[13px]">
                {r.brand}
                {r.spec && ` · ${r.spec}`}
              </span>
              <span className="flex justify-between gap-2 text-[12px] opacity-70">
                <span className="truncate">PO {r.po_number}</span>
                <span className="shrink-0">
                  {formatQty(r.quantity)} · req. {formatDayMonth(r.requested_date)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {o ? (
        <>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-divider px-4 py-5 sm:px-6">
              <div className="min-w-0">
                <h6 className="m-0 text-accent-700">
                  Submitted {timeAgo(o.created_at, at)}
                  {o.submitted_by && ` by ${o.submitted_by}`}
                </h6>
                <h3 className="mb-0 mt-1">
                  {o.company} · {o.brand}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/ops/orders/${o.id}/preview`} target="_blank" className="btn btn-secondary text-text">
                  Preview as customer ↗
                </Link>
                <Link href={`/ops/orders/${o.id}`} className="btn btn-secondary text-text">
                  Order page →
                </Link>
              </div>
            </div>
            <div className="flex flex-col px-4 py-4 text-[14px] sm:px-6">
              {(
                [
                  ["Reference", `${o.order_no} (provisional until confirmed)`],
                  ["Customer PO", o.po_number],
                  ["Brand", o.brand],
                  ["Crown", o.spec || "-"],
                  ["Liner", o.liner || "-"],
                  ["Quantity", `${o.quantity.toLocaleString("en-US")} crowns`],
                  ["Requested date", o.requested_date ? formatDate(o.requested_date) : "Not given"],
                  [
                    "Fulfilment",
                    o.delivery_method === "delivery" ? `Delivery · ${o.delivery_address ?? "-"}` : "Pickup at Bole Lemi",
                  ],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-2.5 border-b border-divider py-2 sm:grid-cols-[130px_minmax(0,1fr)]"
                >
                  <span className="opacity-60">{k}</span>
                  <b className="whitespace-pre-line break-words">{v}</b>
                </div>
              ))}
              <div className="mt-3">
                <h6 className="mb-1 mt-0">Attachments</h6>
                <AttachmentList files={o.attachments} />
              </div>
              {o.messages.length > 0 && (
                <div className="mt-4">
                  <h6 className="mb-1 mt-0">Questions to the customer</h6>
                  <Conversation o={o} canEdit />
                </div>
              )}
            </div>

            {/* PO preview beside the order on wide screens, below it otherwise. */}
            <div className="flex flex-col gap-2.5 bg-neutral-700 p-4 xl:hidden">
              <PoPreview o={o} />
            </div>

            <div className="mt-auto flex flex-col gap-3 border-t-2 border-divider px-4 py-4 sm:px-6">
              <h6 className="m-0">Confirm order</h6>
              <ConfirmForm orderId={o.id} defaultDue={o.requested_date ?? ""} minDate={minDate}>
                <AskDialog orderId={o.id} orderNo={o.order_no} />
                <RejectDialog
                  orderId={o.id}
                  title={`Reject ${o.order_no}?`}
                  summary={`${o.company} · ${o.brand} · ${o.quantity.toLocaleString("en-US")} crowns.`}
                  presets={rejectPresets}
                />
              </ConfirmForm>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 border-l-2 border-divider bg-neutral-700 p-4 max-xl:hidden">
            <PoPreview o={o} />
          </div>
        </>
      ) : (
        <div className="px-6 py-10 text-[14px] opacity-70">Choose an order on the left.</div>
      )}
    </div>
  );
}
