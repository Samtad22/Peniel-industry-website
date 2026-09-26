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
  const COLS = "grid grid-cols-[minmax(0,1fr)_90px_90px_110px_110px_130px_minmax(0,1.3fr)_50px] items-center gap-2.5";
  // Finished goods by customer (design 2f): one bar per customer, its batches below.
  const groups = [...new Set(rows.map((r) => r.company_id))]
    .map((id) => {
      const mine = rows.filter((r) => r.company_id === id);
      const sum = (st: StockStatus) => mine.filter((r) => r.status === st).reduce((t, r) => t + Number(r.quantity), 0);
      const available = sum("available");
      const reserved = sum("reserved");
      const hold = sum("on_hold");
      return {
        id,
        name: (mine[0].companies?.name ?? "-").replace(/\s+S\.C\.$/, ""),
        brands: [...new Set(mine.map((r) => r.brands?.name ?? "-"))],
        available,
        reserved,
        hold,
        total: available + reserved + hold,
        rows: mine,
      };
    })
    .sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...groups.map((g) => g.total));

  return (
    <>
      <OpsHeader
        title="Inventory"
        sub="Raw materials are internal. Customers only ever see their own finished crowns."
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
            <h2 className="m-0 flex items-center gap-2.5 text-[26px] sm:text-[30px]">
              Raw materials <InternalOnly />
            </h2>
            <MaterialDialog materials={(materials ?? []).map((m) => ({ id: m.id, name: m.name, unit: m.unit }))} />
          </div>
          <div className="mt-4 grid grid-cols-2 border-t-2 border-text xl:grid-cols-4">
            {(materials ?? []).map((m, i) => {
              const onHand = Number(m.on_hand);
              const reorder = m.reorder_level == null ? null : Number(m.reorder_level);
              const low = reorder != null && onHand <= reorder;
              // The tank is full at three times the reorder level; the dashed line is the reorder level.
              const full = reorder ? reorder * 3 : Math.max(onHand, 1) * 2;
              const pct = Math.min(85, (onHand / full) * 85);
              const line = reorder ? (reorder / full) * 85 : null;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col gap-3 border-divider px-4 pb-6 pt-[22px] sm:px-6 ${i % 2 ? "border-l-2" : ""} xl:[&:not(:first-child)]:border-l-2 max-xl:[&:nth-child(n+3)]:border-t-2 ${low ? "bg-accent-100" : ""}`}
                >
                  <h6 className={`m-0 ${low ? "text-accent-800" : ""}`}>{m.name}</h6>
                  <div className="relative h-[160px] border-2 border-text bg-surface sm:h-[220px]">
                    <div className={`absolute inset-x-0 bottom-0 ${low ? "bg-accent" : "bg-text"}`} style={{ height: `${pct}%` }} />
                    {line != null && (
                      <>
                        <div className={`absolute -inset-x-1.5 border-t-2 border-dashed ${low ? "border-text" : "border-accent"}`} style={{ bottom: `${line}%` }} />
                        <span
                          className={`absolute right-1.5 bg-surface px-[3px] font-mono text-[10px] font-semibold ${low ? "text-text" : "text-accent-700"}`}
                          style={{ bottom: `calc(${line}% + 4px)` }}
                        >
                          reorder
                        </span>
                      </>
                    )}
                    <span className={`absolute left-2.5 top-2.5 bg-surface px-1.5 py-1 text-[28px] font-extrabold leading-none tracking-[-.04em] sm:text-[36px] ${low ? "text-accent-800" : "text-text"}`}>
                      {formatQty(onHand)}
                      <span className="ml-1 text-[13px] font-normal">{m.unit}</span>
                    </span>
                  </div>
                  <div className={`flex justify-between gap-2 text-[12px] ${low ? "font-extrabold text-accent-800" : ""}`}>
                    <span>{low ? "Below reorder level" : "In stock"}</span>
                    <span>{reorder != null ? `reorder at ${reorder.toLocaleString("en-US")} ${m.unit}` : "no reorder level"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view !== "raw" && (
        <div className="px-4 pb-8 pt-6 sm:px-8">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[26px] sm:text-[30px]">Finished goods by customer</h2>
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
          <div className="mb-1 flex flex-wrap justify-end gap-3.5 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-text" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-neutral-400" />
              Reserved
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-accent-800" />
              On hold
            </span>
          </div>
          {groups.length === 0 && <p className="m-0 border-t-2 border-text py-3 text-[13px] opacity-60">No finished stock.</p>}
          {groups.map((g) => (
            <div key={g.id} className="border-b-2 border-divider py-4 first:border-t-2 first:border-t-text">
              <div className="grid items-center gap-3 sm:grid-cols-[240px_minmax(0,1fr)_110px] sm:gap-5">
                <div className="min-w-0">
                  <b className="text-[16px]">{g.name}</b>
                  <div className="truncate text-[12px] opacity-65">{g.brands.join(" · ")}</div>
                </div>
                <div className="flex h-[22px] gap-0.5" role="img" aria-label={`${formatQty(g.available)} available, ${formatQty(g.reserved)} reserved, ${formatQty(g.hold)} on hold`}>
                  {g.available > 0 && <div className="bg-text" style={{ flex: g.available }} />}
                  {g.reserved > 0 && <div className="bg-neutral-400" style={{ flex: g.reserved }} />}
                  {g.hold > 0 && <div className="bg-accent-800" style={{ flex: g.hold }} />}
                  <div style={{ flex: Math.max(0.0001, maxTotal - g.total) }} />
                </div>
                <b className="text-[24px] tracking-[-.03em] sm:text-right sm:text-[26px]">{formatQty(g.total)}</b>
              </div>
              <div className="mt-2.5 overflow-x-auto sm:ml-[260px]">
                <div className="min-w-[780px]">
                  {g.rows.map((s) => (
                    <div key={s.id} className={`${COLS} border-t border-divider py-[7px] text-[13px]`}>
                      <b className="truncate">{s.brands?.name}</b>
                      <span>{s.batch_no}</span>
                      <b className="text-right tabular-nums">{formatQty(Number(s.quantity))}</b>
                      <span className="opacity-80" title="Internal">
                        {s.location ?? "-"}
                      </span>
                      <span>{formatDate(s.ready_since)}</span>
                      <span>
                        <Pill style={STOCK_PILL[s.status].style}>{STOCK_PILL[s.status].label}</Pill>
                      </span>
                      <span className="truncate text-[12px] opacity-80">
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
            </div>
          ))}
          <p className="mb-0 mt-3 text-[12px] opacity-60">Locations are internal. Customers see their own stock, status and hold reasons.</p>
        </div>
      )}
    </>
  );
}
