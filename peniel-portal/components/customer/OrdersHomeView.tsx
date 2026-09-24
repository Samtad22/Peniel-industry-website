import Link from "next/link";
import Crown from "@/components/ui/Crown";
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

export type BrandCard = { id: string; name: string; spec: string; colours: string[]; open: number };

export type OrdersHomeData = {
  orders: CustomerOrderRow[];
  filter: OrderStatus | null;
  q: string;
  selectedId: string | null;
  brands: BrandCard[];
  submitted: { id: string; order_no: string } | null;
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
          ["01", "Choose a brand, attach your PO", "Pick one of your brands or reorder a previous order."],
          ["02", "Peniel confirms your order", "We check it against your PO and confirm the due date."],
          ["03", "Track every stage", "See where each order is, and download your files any time."],
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

/** Confirmation after submitting an order (design 1i). */
function SubmittedBanner({ id, order_no }: { id: string; order_no: string }) {
  return (
    <div className="grid items-end gap-6 bg-accent px-4 py-8 text-bg sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <h6 className="mb-2.5 mt-0">✓ Order submitted</h6>
        <h1 className="m-0 text-[44px] leading-none tracking-[-0.03em] sm:text-[64px]">{order_no}</h1>
        <p className="mb-0 mt-3 text-[17px] sm:text-[18px]">
          Peniel will check it against your PO and confirm the due date. You can follow it below.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/orders?o=${id}`}
          className="btn btn-split w-[200px] bg-bg px-4 py-3.5 text-text hover:bg-neutral-200 hover:text-text"
        >
          View order<span aria-hidden="true">→</span>
        </Link>
        <Link
          href={`/orders/new?po_from=${id}`}
          className="btn btn-split w-[300px] border-bg px-4 py-3.5 text-bg hover:bg-bg/10 hover:text-bg"
        >
          Order another brand on this PO<span aria-hidden="true">+</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Customer Orders home — design 1b (KPIs, table, detail panel), 1d (empty),
 * 1i (just submitted) and 1r (phone list).
 */
export default function OrdersHomeView({ d, detail }: { d: OrdersHomeData; detail?: React.ReactNode }) {
  const all = d.orders;
  const q = d.q.trim().toLowerCase();
  const matches = q
    ? all.filter((o) => o.order_no.toLowerCase().includes(q) || o.po_number.toLowerCase().includes(q))
    : all;
  const shown = d.filter ? matches.filter((o) => o.status === d.filter) : matches;
  const chips = [
    { key: null as OrderStatus | null, label: "All", n: matches.length },
    ...ORDER_STATUSES.map((s) => ({
      key: s as OrderStatus | null,
      label: statusText(s, "customer"),
      n: matches.filter((o) => o.status === s).length,
    })).filter((c) => c.n > 0),
  ];
  const href = (p: { status?: OrderStatus | null; o?: string | null }) => {
    const sp = new URLSearchParams();
    const status = p.status === undefined ? d.filter : p.status;
    if (status) sp.set("status", status);
    if (d.q) sp.set("q", d.q);
    const o = p.o === undefined ? d.selectedId : p.o;
    if (o) sp.set("o", o);
    const s = sp.toString();
    return s ? `/orders?${s}` : "/orders";
  };

  return (
    <>
      {d.submitted && <SubmittedBanner {...d.submitted} />}

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
        <>
          {d.brands.length > 0 && (
            <div className="flex gap-0 overflow-x-auto border-b-2 border-divider">
              {d.brands.map((b, i) => (
                <div
                  key={b.id}
                  className={
                    "flex min-w-[220px] flex-1 items-center gap-3 px-4 py-3.5 sm:px-6 " +
                    (i ? "border-l-2 border-divider" : "sm:pl-10")
                  }
                >
                  <Crown colours={b.colours} size={32} />
                  <span className="min-w-0 flex-1 text-[13px]">
                    <b className="block truncate text-[14px]">{b.name}</b>
                    <span className="opacity-65">{b.open ? `${b.open} open` : "No open orders"}</span>
                  </span>
                  <Link href={`/orders/new?brand=${b.id}`} className="shrink-0 text-[13px] font-extrabold no-underline">
                    + Order
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div className={detail ? "grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]" : undefined}>
            {detail && (
              <aside className="flex flex-col gap-2 border-b-2 border-divider px-4 pb-10 pt-6 max-sm:hidden sm:px-10 xl:order-2 xl:border-b-0 xl:pl-8">
                <Link href={href({ o: null })} className="self-end text-[13px] no-underline xl:hidden">
                  × Close
                </Link>
                {detail}
              </aside>
            )}
            <div
              className={
                "flex flex-col gap-3.5 px-4 pb-10 pt-6 sm:px-10 " + (detail ? "xl:border-r-2 xl:border-divider xl:pr-8" : "")
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="m-0">Orders</h3>
                <form action="/orders" className="w-full sm:w-[300px]" role="search">
                  {d.filter && <input type="hidden" name="status" value={d.filter} />}
                  <label htmlFor="order-search" className="sr-only">
                    Search order or PO number
                  </label>
                  <input
                    id="order-search"
                    name="q"
                    type="search"
                    defaultValue={d.q}
                    placeholder="Search order or PO number"
                    className="input max-sm:min-h-11"
                  />
                </form>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap">
                {chips.map((c) => {
                  const on = c.key === d.filter;
                  return (
                    <Link
                      key={c.label}
                      href={href({ status: c.key, o: null })}
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

              {shown.length === 0 && (
                <p className="m-0 border-b border-divider py-3 text-[14px] opacity-70">
                  No orders match{q ? ` “${d.q}”` : " this filter"}.{" "}
                  <Link href="/orders">Show all orders</Link>
                </p>
              )}

              {/* Phones: one card per order, opening the order page (design 1r / 1s). */}
              <div className="sm:hidden">
                {shown.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders/${o.id}`}
                    className="flex flex-col gap-1 border-b border-divider py-3.5 text-text no-underline hover:text-text"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <b className="text-[15px]">{o.order_no}</b>
                      <StatusBadge status={o.status} audience="customer" />
                    </span>
                    <span className="text-[13px]">{o.product}</span>
                    <span className="flex justify-between gap-2 text-[12px] opacity-65">
                      <span className="truncate">PO {o.po_number}</span>
                      <span className="shrink-0">
                        {formatQty(o.quantity)} · due {formatDate(o.due_date)}
                      </span>
                    </span>
                    {o.status === "on_hold" && o.customer_reason && (
                      <span className="mt-1 bg-accent-100 px-2 py-2 text-[13px] text-accent-800">{o.customer_reason}</span>
                    )}
                  </Link>
                ))}
              </div>

              {shown.length > 0 && (
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
                    {shown.map((o) => {
                      const selected = o.id === d.selectedId;
                      return (
                        <Link
                          key={o.id}
                          href={href({ o: selected ? null : o.id })}
                          scroll={false}
                          aria-current={selected ? "true" : undefined}
                          className={
                            "block border-b border-divider text-text no-underline hover:text-text " +
                            (selected ? "bg-neutral-200 shadow-[inset_0_0_0_2px_var(--color-text)]" : "hover:bg-text/5")
                          }
                        >
                          <span className={`${ROW} py-[11px] text-[14px]`}>
                            <b>{o.order_no}</b>
                            <span className="truncate">{o.po_number}</span>
                            <span className="truncate">{o.product}</span>
                            <span className="text-right tabular-nums">{Number(o.quantity).toLocaleString("en-US")}</span>
                            <span>{o.status === "on_hold" && !o.due_date ? "On hold" : formatDate(o.due_date)}</span>
                            <span>
                              <StatusBadge status={o.status} audience="customer" />
                            </span>
                          </span>
                          {o.status === "on_hold" && o.customer_reason && !selected && (
                            <span className="block bg-accent-100 px-2 py-2 text-[13px] text-accent-800">{o.customer_reason}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="text-[12px] text-neutral-700">
                Showing {shown.length} of {all.length} orders
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
