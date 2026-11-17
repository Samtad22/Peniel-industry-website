import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip } from "@/components/ops/OpsKit";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { cartonsLabel, deliveryTotals, type Delivery } from "@/lib/deliveries";
import { formatDate, formatQty } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Deliveries by PO" };

type OrderRow = {
  id: string;
  order_no: string;
  po_number: string;
  quantity: number;
  status: OrderStatus;
  company_id: string;
  companies: { name: string } | null;
  brands: { name: string } | null;
};

const n = (x: number) => x.toLocaleString("en-US");
const ROW = "grid grid-cols-[minmax(0,1.4fr)_100px_repeat(3,minmax(0,1fr))_110px] items-center gap-3";

/**
 * Every PO with its brands: ordered, delivered and remaining, as on Peniel's
 * "Order and Delivery" sheet. From the orders and their deliveries (DOs).
 */
export default async function DeliveriesByPoPage({ searchParams }: { searchParams: Promise<{ customer?: string; open?: string }> }) {
  await requireStaff(opsRolesFor("orders"));
  const { customer, open } = await searchParams;
  const onlyOpen = open !== "all";
  const supabase = await createClient();

  let q = supabase
    .from("orders")
    .select("id, order_no, po_number, quantity, status, company_id, companies(name), brands(name)")
    .not("status", "in", "(cancelled,rejected,submitted)")
    .order("order_no");
  if (customer && /^[0-9a-f-]{36}$/i.test(customer)) q = q.eq("company_id", customer);
  const [{ data: orderData }, { data: delData }, { data: companies }] = await Promise.all([
    q.returns<OrderRow[]>(),
    supabase.from("order_deliveries").select("order_id, kind, quantity, delivered_on").returns<Pick<Delivery, "order_id" | "kind" | "quantity" | "delivered_on">[]>(),
    supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
  ]);
  const dels = delData ?? [];
  const lines = (orderData ?? []).map((o) => {
    const mine = dels.filter((d) => d.order_id === o.id);
    const last = mine.map((d) => d.delivered_on).filter(Boolean).sort().at(-1) ?? null;
    return { ...o, t: deliveryTotals(Number(o.quantity), mine), last, dos: mine.filter((d) => d.kind === "delivery").length };
  });

  // Group: customer → PO.
  const pos = new Map<string, { company: string; po: string; lines: typeof lines }>();
  for (const l of lines) {
    const key = `${l.company_id}|${l.po_number}`;
    if (!pos.has(key)) pos.set(key, { company: l.companies?.name ?? "", po: l.po_number, lines: [] });
    pos.get(key)!.lines.push(l);
  }
  const groups = [...pos.values()]
    .map((g) => ({
      ...g,
      ordered: g.lines.reduce((s, l) => s + l.t.ordered, 0),
      delivered: g.lines.reduce((s, l) => s + l.t.delivered, 0),
      remaining: g.lines.reduce((s, l) => s + l.t.remaining, 0),
    }))
    .filter((g) => !onlyOpen || g.remaining > 0)
    .sort((a, b) => a.company.localeCompare(b.company) || a.po.localeCompare(b.po));
  const sum = (k: "ordered" | "delivered" | "remaining") => groups.reduce((s, g) => s + g[k], 0);

  return (
    <>
      <OpsHeader
        crumb={{ label: "Orders", href: "/ops/orders", current: "Deliveries by PO" }}
        title="Deliveries by PO"
        sub="Each PO and its brands: ordered, delivered (DOs) and remaining. Return exchanges are listed on the order, not counted again."
      />
      <KpiStrip
        items={[
          { label: "POs", value: groups.length, sub: onlyOpen ? "with crowns still to deliver" : "in all" },
          { label: "Ordered", value: formatQty(sum("ordered")), sub: cartonsLabel(sum("ordered")) },
          { label: "Delivered", value: formatQty(sum("delivered")), sub: cartonsLabel(sum("delivered")) },
          { label: "Remaining", value: formatQty(sum("remaining")), sub: cartonsLabel(sum("remaining")) },
        ]}
      />
      <form className="flex flex-wrap items-end gap-3 border-b-2 border-divider bg-surface px-4 py-3.5 sm:px-8">
        <div className="field w-full sm:w-[260px]">
          <label htmlFor="d-customer">Customer</label>
          <select id="d-customer" name="customer" defaultValue={customer ?? ""} className="input">
            <option value="">All customers</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field w-[200px]">
          <label htmlFor="d-open">Show</label>
          <select id="d-open" name="open" defaultValue={onlyOpen ? "" : "all"} className="input">
            <option value="">POs still to deliver</option>
            <option value="all">All POs</option>
          </select>
        </div>
        <button type="submit" className="btn btn-secondary text-text">
          Show
        </button>
      </form>

      <div className="overflow-x-auto px-4 pb-8 sm:px-8">
        <div className="min-w-[760px]">
          {groups.length === 0 && <p className="m-0 py-6 text-[13px] opacity-60">No POs here.</p>}
          {groups.map((g) => (
            <section key={`${g.company}|${g.po}`} className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-text pb-1.5">
                <h2 className="m-0 text-[22px]">
                  {g.company} · PO {g.po}
                </h2>
                <span className="text-[13px]">
                  <b>{n(g.delivered)}</b> of {n(g.ordered)} delivered · <b>{n(g.remaining)}</b> remaining
                </span>
              </div>
              <div className={`${ROW} th-row border-b border-divider py-2`}>
                <span>Brand · order</span>
                <span>Status</span>
                <span className="text-right">Ordered</span>
                <span className="text-right">Delivered</span>
                <span className="text-right">Remaining</span>
                <span className="text-right">Last DO</span>
              </div>
              {g.lines.map((l) => (
                <div key={l.id} className={`${ROW} border-b border-divider py-2 text-[13px]`}>
                  <span className="min-w-0">
                    <b>{l.brands?.name ?? "-"}</b>
                    <Link href={`/ops/orders/${l.id}`} className="ml-2 text-text">
                      {l.order_no}
                    </Link>
                    <span className="block h-1.5 max-w-[220px] bg-neutral-200" aria-hidden="true">
                      <span className="block h-full bg-text" style={{ width: `${l.t.pct}%` }} />
                    </span>
                  </span>
                  <span>
                    <StatusBadge status={l.status} />
                  </span>
                  <span className="text-right tabular-nums">{n(l.t.ordered)}</span>
                  <span className="text-right tabular-nums">
                    {n(l.t.delivered)}
                    <span className="block text-[11px] opacity-60">
                      {l.dos} DO{l.dos === 1 ? "" : "s"}
                      {l.t.returnExchange ? ` · RE ${n(l.t.returnExchange)}` : ""}
                    </span>
                  </span>
                  <span className={`text-right tabular-nums ${l.t.remaining ? "font-extrabold" : "opacity-60"}`}>{n(l.t.remaining)}</span>
                  <span className="text-right opacity-75">{l.last ? formatDate(l.last) : "-"}</span>
                </div>
              ))}
              <div className={`${ROW} py-2 text-[13px] font-extrabold`}>
                <span>Total</span>
                <span />
                <span className="text-right tabular-nums">{n(g.ordered)}</span>
                <span className="text-right tabular-nums">{n(g.delivered)}</span>
                <span className="text-right tabular-nums">{n(g.remaining)}</span>
                <span />
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
