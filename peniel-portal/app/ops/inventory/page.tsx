import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import { MaterialDialog, ReceiveStockDialog, StockStatusDialog } from "@/components/ops/InventoryForms";
import { Pill } from "@/components/ui/StatusBadge";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";
import { STOCK_PILL, type StockStatus } from "@/lib/inventory";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inventory" };

type Material = { id: string; name: string; unit: string; on_hand: number; reorder_level: number | null };
type Stock = {
  id: string;
  company_id: string;
  batch_no: string;
  quantity: number;
  location: string | null;
  status: StockStatus;
  customer_reason: string | null;
  ready_since: string;
  order_id: string | null;
  companies: { name: string } | null;
  brands: { name: string } | null;
  orders: { order_no: string } | null;
};

/** Inventory: raw materials (internal) and finished goods by customer and brand (design 1k). */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ v?: string; customer?: string; q?: string }> }) {
  const me = await requireStaff(opsRolesFor("inventory"));
  const sp = await searchParams;
  const view = sp.v === "raw" || sp.v === "finished" ? sp.v : "all";
  const canStock = ["admin", "warehouse", "quality"].includes(me.role);
  const supabase = await createClient();

  const [{ data: materials }, { data: stock }, { data: companies }, { data: brands }, { data: orders }, { count: openPickups }] = await Promise.all([
    supabase.from("raw_materials").select("id, name, unit, on_hand, reorder_level").order("name").returns<Material[]>(),
    supabase
      .from("finished_stock")
      .select("id, company_id, batch_no, quantity, location, status, customer_reason, ready_since, order_id, companies(name), brands(name), orders(order_no)")
      .is("collected_at", null)
      .order("ready_since", { ascending: false })
      .returns<Stock[]>(),
    supabase.from("companies").select("id, name").eq("active", true).order("name").returns<{ id: string; name: string }[]>(),
    supabase.from("brands").select("id, name, company_id").eq("active", true).order("name").returns<{ id: string; name: string; company_id: string }[]>(),
    supabase
      .from("orders")
      .select("id, order_no, company_id, brand_id")
      .not("status", "in", "(delivered,rejected,submitted)")
      .order("order_no", { ascending: false })
      .returns<{ id: string; order_no: string; company_id: string; brand_id: string }[]>(),
    supabase.from("pickup_bookings").select("id", { count: "exact", head: true }).neq("status", "collected"),
  ]);

  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = (stock ?? []).filter(
    (s) =>
      (!sp.customer || s.company_id === sp.customer) &&
      (!q || s.batch_no.toLowerCase().includes(q) || (s.orders?.order_no ?? "").toLowerCase().includes(q)),
  );
  const seg = (k: string, label: string) => (
    <Link key={k} href={k === "all" ? "/ops/inventory" : `/ops/inventory?v=${k}`} className={`seg-opt no-underline ${view === k ? "!bg-accent !text-bg" : "text-text"}`}>
      {label}
    </Link>
  );
  const COLS = "grid grid-cols-[minmax(0,1.2fr)_110px_110px_110px_130px_190px_minmax(0,1fr)_50px] items-center gap-3";

  return (
    <>
      <OpsHeader
        title="Inventory"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="seg">
              {seg("all", "All")}
              {seg("raw", "Raw material")}
              {seg("finished", "Finished goods")}
            </div>
            <Link href="/ops/inventory/pickups" className="btn btn-secondary text-text">
              Pickups ({openPickups ?? 0}) →
            </Link>
            {canStock && (
              <ReceiveStockDialog
                companies={companies ?? []}
                brands={brands ?? []}
                orders={(orders ?? []).map((o) => ({ id: o.id, name: o.order_no, company_id: o.company_id, brand_id: o.brand_id }))}
              />
            )}
          </div>
        }
      />

      {view !== "finished" && (
        <div className="border-b-2 border-divider">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-8">
            <h4 className="m-0 flex items-center gap-2">
              Raw materials <InternalOnly />
            </h4>
            <MaterialDialog materials={(materials ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit }))} />
          </div>
          <div className="overflow-hidden">
            <div className="-ml-0.5 mt-4 grid grid-cols-2 xl:grid-cols-4">
              {(materials ?? []).map((m) => {
                const onHand = Number(m.on_hand);
                const reorder = m.reorder_level == null ? null : Number(m.reorder_level);
                const low = reorder != null && onHand <= reorder;
                const pct = reorder ? Math.min(100, (onHand / (reorder * 3)) * 100) : 50;
                return (
                  <div key={m.id} className={`flex flex-col gap-2 border-l-2 border-t-2 border-divider px-4 py-5 sm:px-6 ${low ? "bg-accent-100" : "bg-surface"}`}>
                    <h6 className={`m-0 ${low ? "text-accent-800" : "opacity-60"}`}>{m.name}</h6>
                    <div className={`text-[34px] font-extrabold leading-none ${low ? "text-accent-700" : ""}`}>
                      {onHand.toLocaleString("en-US")} <span className="text-[14px] font-normal">{m.unit}</span>
                    </div>
                    <div className="relative h-2 bg-bg">
                      <div className={`absolute inset-y-0 left-0 ${low ? "bg-accent" : "bg-text"}`} style={{ width: `${pct}%` }} />
                      {reorder != null && <div className="absolute inset-y-[-3px] w-0.5 bg-accent-700" style={{ left: `${100 / 3}%` }} title={`Reorder at ${reorder}`} />}
                    </div>
                    <div className="flex justify-between gap-2 text-[12px]">
                      <span className={low ? "font-extrabold text-accent-800" : "opacity-70"}>{low ? "Below reorder level" : "In stock"}</span>
                      <span className="opacity-70">{reorder != null ? `reorder at ${reorder.toLocaleString("en-US")} ${m.unit}` : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {view !== "raw" && (
        <div className="px-4 pb-8 pt-6 sm:px-8">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
            <h4 className="m-0">Finished goods by customer &amp; brand</h4>
            <form className="flex flex-wrap gap-2">
              {view !== "all" && <input type="hidden" name="v" value={view} />}
              <label htmlFor="inv-c" className="sr-only">Customer</label>
              <select id="inv-c" name="customer" defaultValue={sp.customer ?? ""} className="input w-[200px]">
                <option value="">All customers</option>
                {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label htmlFor="inv-q" className="sr-only">Search batch or order</label>
              <input id="inv-q" name="q" type="search" defaultValue={sp.q} placeholder="Search batch or order" className="input w-[220px]" />
              <button type="submit" className="btn btn-secondary text-text">Apply</button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className={`${COLS} th-row border-b-2 border-divider py-2`}>
                <span>Customer · brand</span>
                <span>Batch</span>
                <span className="text-right">Quantity</span>
                <span className="flex items-center gap-1">Location</span>
                <span>Ready since</span>
                <span>Status</span>
                <span>Order / reason</span>
                <span />
              </div>
              {rows.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No finished stock.</p>}
              {rows.map((s) => (
                <div key={s.id} className={`${COLS} border-b border-divider py-2.5 text-[13px]`}>
                  <span className="truncate">
                    <b>{s.companies?.name}</b> · {s.brands?.name}
                  </span>
                  <span>{s.batch_no}</span>
                  <b className="text-right tabular-nums">{formatQty(Number(s.quantity))}</b>
                  <span className="opacity-80">{s.location ?? "—"}</span>
                  <span>{formatDate(s.ready_since)}</span>
                  <span>
                    <Pill style={STOCK_PILL[s.status].style}>{STOCK_PILL[s.status].label}</Pill>
                  </span>
                  <span className="truncate text-[12px]">
                    {s.order_id ? (
                      <Link href={`/ops/orders/${s.order_id}`} className="text-text">
                        {s.orders?.order_no}
                      </Link>
                    ) : null}
                    {s.customer_reason && <span className="text-accent-800"> · {s.customer_reason}</span>}
                  </span>
                  <span>
                    {canStock && (
                      <StockStatusDialog id={s.id} label={s.batch_no} status={s.status} reason={s.customer_reason ?? ""} location={s.location ?? ""} />
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mb-0 mt-3 text-[12px] opacity-60">Locations are internal. Customers see their own stock, status and hold reasons.</p>
        </div>
      )}
    </>
  );
}
