import Link from "next/link";
import { AskDialog, ConfirmForm, RejectDialog, type Preset } from "@/components/ops/OrderForms";
import { OpsTopBar } from "@/components/ops/OpsHeader";
import PoCheck, { type PoField } from "@/components/ops/PoCheck";
import { AttachmentList, Conversation } from "@/components/ops/StaffOrderView";
import { formatBytes } from "@/lib/files";
import { formatDate, formatQty, timeAgo } from "@/lib/format";
import { inkNames } from "@/lib/inks";
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
        <iframe src={src} loading="lazy" title={`Preview of ${po.file_name}`} className="h-[720px] w-full border-0 bg-white" />
      ) : isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} loading="lazy" alt={`Purchase order ${po.file_name}`} className="w-full bg-white shadow-lg" />
      ) : (
        <p className="m-0 bg-white p-6 text-[13px] text-text">
          This file type can&apos;t be previewed. <a href={`/files/attachments/${po.id}`}>Download {po.file_name}</a>
        </p>
      )}
      <div className="text-[11px] text-bg opacity-70">Tick each field on the left as you read the PO. Red means it doesn&apos;t match.</div>
    </>
  );
}

const shortAgo = (value: string, now: Date) => timeAgo(value, now).replace(" ago", "").replace(/\s+/g, "");

/** Order inbox, v2 (design 2c): the list, the order checked against its PO, and the PO itself. */
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
  const oldest = rows.at(-1);
  const fields: PoField[] = o
    ? [
        { key: "po", label: "Customer PO", order: o.po_number },
        { key: "product", label: "Product", order: [o.brand, o.spec, inkNames(o.brand_colours)].filter(Boolean).join(" · ") },
        { key: "liner", label: "Liner", order: o.liner || "-" },
        { key: "qty", label: "Quantity", order: o.quantity.toLocaleString("en-US") },
        { key: "date", label: "Delivery date", order: o.requested_date ? formatDate(o.requested_date) : "Not given" },
      ]
    : [];

  return (
    <>
      <OpsTopBar>
        <span className="text-[13px] opacity-70">Orders submitted from the customer portal</span>
      </OpsTopBar>
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_430px]">
        <div className="border-divider lg:border-r-2">
          <div className="border-b-2 border-text px-6 pb-[18px] pt-[22px]">
            <h1 className="m-0 text-[48px] leading-[.95] tracking-[-.04em]">Inbox</h1>
            <div className="mt-1.5 text-[13px] opacity-70">
              {rows.length ? `${rows.length} waiting · oldest ${timeAgo(oldest!.created_at, at).replace(" ago", "")}` : "Nothing waiting"}
            </div>
          </div>
          {rows.length === 0 && <p className="m-0 px-6 py-4 text-[14px] opacity-70">No new orders. Everything is confirmed.</p>}
          <div className="flex overflow-x-auto lg:block">
            {rows.map((r) => {
              const on = r.id === o?.id;
              return (
                <Link
                  key={r.id}
                  href={`/ops/inbox?o=${r.id}`}
                  scroll={false}
                  aria-current={on ? "true" : undefined}
                  className={
                    "flex min-w-[260px] flex-col gap-1.5 border-b-2 border-divider px-6 py-[18px] no-underline max-lg:border-r-2 " +
                    (on ? "bg-text text-bg hover:text-bg" : "text-text hover:bg-text/5 hover:text-text")
                  }
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[44px] font-extrabold leading-[.9] tracking-[-.05em]">{shortAgo(r.created_at, at)}</span>
                    <span className="truncate font-mono text-[10px] font-semibold tracking-[.1em] opacity-70">{r.po_number}</span>
                  </span>
                  <b className="text-[15px]">{r.company}</b>
                  <span className="text-[13px] opacity-80">
                    {r.brand} · {formatQty(r.quantity)}
                    {r.spec && ` · ${r.spec}`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {o ? (
          <>
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-divider px-4 pb-5 pt-[22px] sm:px-7">
                <div className="min-w-0">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-accent-700">
                    Submitted {timeAgo(o.created_at, at)}
                    {o.submitted_by && ` · ${o.submitted_by}`}
                  </span>
                  <h2 className="mb-0.5 mt-1.5 text-[28px] tracking-[-.03em] sm:text-[36px]">{o.company}</h2>
                  <div className="text-[15px]">
                    {o.brand} · {o.quantity.toLocaleString("en-US")} × {[o.spec, o.liner].filter(Boolean).join(" · ")}
                  </div>
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

              <PoCheck orderId={o.id} fields={fields} />

              <div className="flex flex-col gap-4 px-4 py-5 text-[14px] sm:px-7">
                <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 text-[13px]">
                  <span className="opacity-70">Fulfilment</span>
                  <b className="break-words">{o.delivery_method === "delivery" ? `Delivery · ${o.delivery_address ?? "-"}` : "Pickup at Bole Lemi"}</b>
                </div>
                <div>
                  <h6 className="mb-1 mt-0">Attachments</h6>
                  <AttachmentList files={o.attachments} />
                </div>
                {o.messages.length > 0 && (
                  <div>
                    <h6 className="mb-1 mt-0">Questions to the customer</h6>
                    <Conversation o={o} canEdit />
                  </div>
                )}
              </div>

              {/* The PO beside the order on wide screens, here otherwise. */}
              <div className="flex flex-col gap-3 bg-text p-[18px] xl:hidden">
                <PoPreview o={o} />
              </div>

              <div className="mt-auto border-t-2 border-text px-4 pb-6 pt-5 sm:px-7">
                <ConfirmForm orderId={o.id} orderNo={o.order_no} defaultDue={o.requested_date ?? ""} minDate={minDate}>
                  <AskDialog orderId={o.id} orderNo={o.order_no} bar />
                  <RejectDialog
                    bar
                    orderId={o.id}
                    title={`Reject ${o.order_no}?`}
                    summary={`${o.company} · ${o.brand} · ${o.quantity.toLocaleString("en-US")} crowns.`}
                    presets={rejectPresets}
                  />
                </ConfirmForm>
              </div>
            </div>
            <div className="flex flex-col gap-3 bg-text p-[18px] max-xl:hidden">
              <PoPreview o={o} />
            </div>
          </>
        ) : (
          <div className="px-6 py-10 text-[14px] opacity-70">Choose an order on the left.</div>
        )}
      </div>
    </>
  );
}
