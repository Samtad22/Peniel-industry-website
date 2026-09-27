import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip } from "@/components/ops/OpsKit";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDayMonth, formatQty } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { opsRolesFor } from "@/lib/roles";
import { DUE_WINDOWS, listStaffOrders, parseOrderFilters } from "@/lib/staff-orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Orders" };

const ROW =
  "grid grid-cols-[96px_minmax(0,1.3fr)_90px_116px_minmax(0,1fr)_70px_70px_190px_70px] items-center gap-3";

/** All orders (design 1e, in the v2 look). */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff(opsRolesFor("orders"));
  const sp = await searchParams;
  const f = parseOrderFilters(sp);
  const supabase = await createClient();

  const [rows, { data: companies }, { data: brands }] = await Promise.all([
    listStaffOrders(supabase, f, addisDateISO(new Date())),
    supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("brands")
      .select("id, name, company_id")
      .order("name")
      .returns<{ id: string; name: string; company_id: string }[]>(),
  ]);

  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const today = addisDateISO(new Date());
  const in7 = addisDateISO(new Date(), 6);
  const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;
  const late = (r: (typeof rows)[number]) => !!r.due_date && r.due_date < today && !["dispatched", "delivered", "rejected"].includes(r.status);
  const query = new URLSearchParams(
    Object.entries({ q: f.q, customer: f.customer, brand: f.brand, status: f.status, due: f.due }).filter(([, v]) => v),
  ).toString();
  const brandOptions = (brands ?? []).filter((b) => !f.customer || b.company_id === f.customer);

  return (
    <>
      <OpsHeader
        title="Orders"
        sub={`${rows.length} order${rows.length === 1 ? "" : "s"} · ${formatQty(total)} crowns${f.status === "open" ? " still to deliver" : ""}`}
        actions={
          <a href={`/ops/orders/export?${query}`} className="btn btn-secondary text-text">
            Export ↓
          </a>
        }
      />
      <KpiStrip
        items={[
          { label: "In production", value: count((r) => r.status === "in_production"), sub: "on the lines", href: "/ops/orders?status=in_production" },
          { label: "Due in 7 days", value: count((r) => !!r.due_date && r.due_date >= today && r.due_date <= in7), sub: "in this list", href: "/ops/orders?due=7" },
          { label: "Late", value: count(late), sub: "past the due date", warn: count(late) > 0, href: "/ops/orders" },
          { label: "On hold", value: count((r) => r.status === "on_hold"), sub: "with a reason", href: "/ops/orders?status=on_hold" },
        ]}
      />
      <form className="flex flex-wrap items-end gap-3 border-b-2 border-divider bg-surface px-4 py-3.5 sm:px-8">
        <div className="field w-full sm:w-[240px]">
          <label htmlFor="f-q">Search</label>
          <input id="f-q" name="q" type="search" defaultValue={f.q} placeholder="Order, PO, customer" className="input" />
        </div>
        <div className="field w-[calc(50%-6px)] sm:w-[200px]">
          <label htmlFor="f-customer">Customer</label>
          <select id="f-customer" name="customer" defaultValue={f.customer} className="input">
            <option value="">All customers ({companies?.length ?? 0})</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-[calc(50%-6px)] sm:w-[170px]">
          <label htmlFor="f-brand">Brand</label>
          <select id="f-brand" name="brand" defaultValue={f.brand} className="input">
            <option value="">All brands</option>
            {brandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-[calc(50%-6px)] sm:w-[200px]">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" defaultValue={f.status} className="input">
            <option value="open">Open (not delivered)</option>
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-[calc(50%-6px)] sm:w-[160px]">
          <label htmlFor="f-due">Due date</label>
          <select id="f-due" name="due" defaultValue={f.due} className="input">
            {Object.entries(DUE_WINDOWS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary text-text">
          Apply
        </button>
        <span className="ml-auto text-[12px] opacity-70">
          {rows.length} order{rows.length === 1 ? "" : "s"} · {formatQty(total)} crowns
        </span>
      </form>

      <div className="px-4 pb-8 pt-2 sm:px-8">
        {rows.length === 0 && (
          <p className="m-0 py-6 text-[14px] opacity-70">
            No orders match these filters. <Link href="/ops/orders">Clear filters</Link>
          </p>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <div className={`${ROW} th-row border-b-2 border-text pb-2 pt-4`}>
                <span>Order</span>
                <span>Customer</span>
                <span>Brand</span>
                <span>PO</span>
                <span>Product</span>
                <span className="text-right">Qty</span>
                <span>Due</span>
                <span>Status</span>
                <span>Line</span>
              </div>
              {rows.map((o) => (
                <Link
                  key={o.id}
                  href={`/ops/orders/${o.id}`}
                  className={`${ROW} border-b border-divider py-3 text-[13px] text-text no-underline hover:bg-text/5 hover:text-text ${o.status === "on_hold" ? "bg-accent-100 shadow-[inset_4px_0_0_var(--color-accent-800)]" : ""}`}
                >
                  <b className="text-[14px]">{o.order_no}</b>
                  <span className="truncate">{o.company}</span>
                  <span className="truncate">{o.brand}</span>
                  <span className="truncate">{o.po_number}</span>
                  <span className="truncate">{o.product}</span>
                  <span className="text-right tabular-nums">{formatQty(o.quantity)}</span>
                  <span className={late(o) ? "font-extrabold text-accent-700" : undefined} title={late(o) ? "Past the due date" : undefined}>
                    {o.due_date ? formatDayMonth(o.due_date) : "-"}
                  </span>
                  <span>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="opacity-70">{o.lines.join(" · ") || "-"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
