import Link from "next/link";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatDate, formatQty } from "@/lib/format";
import { ORDER_STATUSES, statusText, type OrderStatus } from "@/lib/order-status";

export type CustomerOrderRow = {
  id: string;
  order_no: string;
  po_number: string;
  product: string;
  quantity: number;
  due_date: string | null;
  status: OrderStatus;
  customer_reason: string | null;
};

export type OrdersHomeData = {
  orders: CustomerOrderRow[];
  filter: OrderStatus | null;
  kpis: { open: number; inProduction: number; awaiting: number; deliveredYtd: number };
};

const ROW = "grid grid-cols-[92px_112px_minmax(0,1fr)_96px_110px_184px] items-center gap-3 px-2";

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b-2 border-l-2 border-divider px-4 py-5 sm:px-10">
      <h6 className="m-0 opacity-60">{label}</h6>
      <div className="kpi max-sm:text-[28px]">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <>
      <div className="flex max-w-[720px] flex-col gap-4 px-4 pb-8 pt-16 sm:px-10">
        <h6 className="m-0 text-accent">Orders</h6>
        <h1 className="m-0 text-[40px] leading-none sm:text-[56px]">No orders yet.</h1>
        <p className="m-0 text-[17px]">
          Place your first order and attach your PO. It shows up here as soon as you submit it.
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <Link href="/orders/new" className="btn btn-primary btn-split w-[240px] px-4 py-3.5">
            + Place your first order<span aria-hidden="true">→</span>
          </Link>
          <Link href="/catalog" className="btn btn-secondary btn-split w-[200px] px-4 py-3.5 text-text">
            Browse catalog<span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      <div className="mx-4 mb-12 mt-6 grid border-t-2 border-text sm:mx-10 md:grid-cols-3">
        {[
          ["01", "Choose a product, attach your PO", "From the catalog, a reorder, or a custom-printed crown."],
          ["02", "Approve the artwork proof", "For printed crowns only. Approve or request changes in the portal."],
          ["03", "Track production, download QC", "See each stage and download a certificate for every batch."],
        ].map(([n, h, t], i) => (
          <div key={n} className={"pt-5 md:pr-6 " + (i ? "md:border-l-2 md:border-divider md:pl-6" : "")}>
            <div className="text-[36px] font-extrabold text-accent">{n}</div>
            <h5 className="mb-1 mt-1.5">{h}</h5>
            <div className="text-[13px]">{t}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Customer Orders home — design 1b (KPIs, status chips, table) and 1d (empty). */
export default function OrdersHomeView({ d }: { d: OrdersHomeData }) {
  const all = d.orders;
  const shown = d.filter ? all.filter((o) => o.status === d.filter) : all;
  const chips = [
    { key: null as OrderStatus | null, label: "All", n: all.length },
    ...ORDER_STATUSES.map((s) => ({ key: s as OrderStatus | null, label: statusText(s, "customer"), n: all.filter((o) => o.status === s).length })).filter(
      (c) => c.n > 0,
    ),
  ];

  return (
    <>
      <div className="overflow-hidden">
        <div className={"-ml-0.5 grid grid-cols-2 lg:grid-cols-4 " + (all.length ? "" : "text-neutral-600")}>
          <Kpi label="Open orders" value={d.kpis.open} />
          <Kpi label="In production" value={d.kpis.inProduction} />
          {d.kpis.awaiting > 0 ? (
            <Link
              href="/artwork"
              className="block border-b-2 border-l-2 border-divider bg-accent px-4 py-5 text-bg no-underline hover:text-bg sm:px-10"
            >
              <h6 className="m-0">Awaiting your approval</h6>
              <div className="flex items-baseline justify-between gap-2">
                <span className="kpi max-sm:text-[28px]">{d.kpis.awaiting}</span>
                <span className="text-[13px]">Review proof →</span>
              </div>
            </Link>
          ) : (
            <Kpi label="Awaiting your approval" value={0} />
          )}
          <Kpi label="Delivered YTD (crowns)" value={formatQty(d.kpis.deliveredYtd)} />
        </div>
      </div>

      {all.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3.5 px-4 pb-10 pt-6 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="m-0">Orders</h3>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap">
            {chips.map((c) => {
              const on = c.key === d.filter;
              return (
                <Link
                  key={c.label}
                  href={c.key ? `/orders?status=${c.key}` : "/orders"}
                  aria-current={on ? "page" : undefined}
                  className={
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[12px] no-underline " +
                    (on
                      ? "border-text bg-text text-bg hover:text-bg"
                      : "border-divider text-text hover:bg-text/5 hover:text-text")
                  }
                >
                  {c.label}
                  <b className="opacity-60">{c.n}</b>
                </Link>
              );
            })}
          </div>

          {/* Phones: one card per order (design 1r). */}
          <div className="sm:hidden">
            {shown.map((o) => (
              <div key={o.id} className="flex flex-col gap-1 border-b border-divider py-3.5">
                <span className="flex items-center justify-between gap-2">
                  <b className="text-[15px]">{o.order_no}</b>
                  <StatusBadge status={o.status} audience="customer" />
                </span>
                <span className="text-[13px]">{o.product}</span>
                <span className="flex justify-between gap-2 text-[12px] opacity-65">
                  <span className="truncate">PO {o.po_number}</span>
                  <span className="shrink-0">
                    {formatQty(o.quantity)} · due {o.status === "on_hold" && !o.due_date ? "—" : formatDate(o.due_date)}
                  </span>
                </span>
                {o.status === "on_hold" && o.customer_reason && (
                  <p className="m-0 mt-1 bg-accent-100 px-2 py-2 text-[13px] text-accent-800">{o.customer_reason}</p>
                )}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto max-sm:hidden">
            <div className="min-w-[760px]">
              <div className={`${ROW} th-row border-b-2 border-divider py-2`}>
                <span>Order no.</span>
                <span>Customer PO</span>
                <span>Product</span>
                <span className="text-right">Quantity</span>
                <span>Due</span>
                <span>Status</span>
              </div>
              {shown.map((o) => (
                <div key={o.id} className="border-b border-divider">
                  <div className={`${ROW} py-[11px] text-[14px]`}>
                    <b>{o.order_no}</b>
                    <span className="truncate">{o.po_number}</span>
                    <span className="truncate">{o.product}</span>
                    <span className="text-right tabular-nums">{Number(o.quantity).toLocaleString("en-US")}</span>
                    <span>{o.status === "on_hold" && !o.due_date ? "On hold" : formatDate(o.due_date)}</span>
                    <span>
                      <StatusBadge status={o.status} audience="customer" />
                    </span>
                  </div>
                  {o.status === "on_hold" && o.customer_reason && (
                    <p className="m-0 bg-accent-100 px-2 py-2 text-[13px] text-accent-800">{o.customer_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[12px] text-neutral-700">
            Showing {shown.length} of {all.length} orders
          </div>
        </div>
      )}
    </>
  );
}
