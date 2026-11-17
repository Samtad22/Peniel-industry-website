import type { Metadata } from "next";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip, SectionHead } from "@/components/ops/OpsKit";
import { DeleteProducedGoods, EditProducedGoods, ProducedGoodsForm, type GoodsEntry, type GoodsOrder } from "@/components/ops/ProducedGoodsForm";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDayMonth, formatQty } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { batchKey, CROWNS_PER_CARTON, leftToMake } from "@/lib/produced-goods";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Produced goods" };

type OrderRow = { id: string; order_no: string; status: OrderStatus; quantity: number; companies: { name: string } | null; brands: { name: string } | null };
type InspectionRow = { id: string; order_id: string; batch_no: string; result: "released" | "on_hold" | null; published: boolean; inspected_at: string };
type GoodsRow = GoodsEntry & { created_at: string; profiles: { full_name: string } | null };

/** Orders produced goods can be recorded for: confirmed onwards, not rejected or cancelled. */
const RECORDABLE: OrderStatus[] = ["confirmed", "awaiting_approval", "scheduled", "in_production", "quality_check", "ready_for_pickup", "dispatched", "delivered", "on_hold"];
const shortCompany = (name: string | undefined | null) => (name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "");
const n = (x: number) => x.toLocaleString("en-US");
const cartons = (crowns: number) => (crowns % CROWNS_PER_CARTON === 0 ? ` · ${n(crowns / CROWNS_PER_CARTON)} cartons` : ` · ${n(Math.round((crowns / CROWNS_PER_CARTON) * 10) / 10)} cartons`);

/**
 * Produced goods: the good crowns produced for each batch of an order,
 * entered by hand. The batch's Certificate of Analysis shows their total as
 * its Quantity (migration 20261117000001). Internal: customers see only the
 * total, on their certificate.
 */
export default async function ProducedGoodsPage() {
  const me = await requireStaff(opsRolesFor("goods"));
  const canEnter = ["admin", "production", "quality"].includes(me.role);
  const canDelete = me.role === "admin";
  const today = addisDateISO(new Date());
  const supabase = await createClient();

  const [{ data: orderData }, { data: inspData }, { data: goodsData }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, status, quantity, companies(name), brands(name)")
      .in("status", RECORDABLE)
      .order("order_no", { ascending: false })
      .returns<OrderRow[]>(),
    supabase.from("qc_inspections").select("id, order_id, batch_no, result, published, inspected_at").order("inspected_at", { ascending: false }).returns<InspectionRow[]>(),
    supabase
      .from("produced_goods")
      .select("id, order_id, batch_no, quantity, produced_on, notes, created_at, profiles(full_name)")
      .order("produced_on", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<GoodsRow[]>(),
  ]);
  const ordersAll = orderData ?? [];
  // Deliveries of these orders (return exchanges don't count): what is left to make.
  const { data: delData } = ordersAll.length
    ? await supabase
        .from("order_deliveries")
        .select("order_id, delivered_on, quantity")
        .eq("kind", "delivery")
        .in("order_id", ordersAll.map((o) => o.id))
        .returns<{ order_id: string; delivered_on: string | null; quantity: number }[]>()
    : { data: [] };
  const inspections = inspData ?? [];
  const goods = goodsData ?? [];
  const orderById = new Map(ordersAll.map((o) => [o.id, o]));

  // Totals per order and batch (as the certificate adds them up).
  const totals: Record<string, number> = {};
  for (const g of goods) {
    const k = `${g.order_id}|${batchKey(g.batch_no)}`;
    totals[k] = (totals[k] ?? 0) + Number(g.quantity);
  }
  const inspectionFor = (orderId: string, batch: string) => inspections.find((i) => i.order_id === orderId && batchKey(i.batch_no) === batchKey(batch));

  // Each order with what is still left to make (not the whole PO): open ones first, most left first.
  const orders: GoodsOrder[] = ordersAll
    .map((o) => {
      const l = leftToMake(
        Number(o.quantity),
        (delData ?? []).filter((d) => d.order_id === o.id),
        goods.filter((g) => g.order_id === o.id),
      );
      return {
        id: o.id,
        label: `${o.order_no} · ${shortCompany(o.companies?.name)} · ${o.brands?.name ?? ""} · ${l.left > 0 ? `${formatQty(l.left)} left of ${formatQty(l.ordered)}` : `complete (${formatQty(l.ordered)})`}`,
        ordered: l.ordered,
        left: l.left,
        batches: inspections.filter((i) => i.order_id === o.id).map((i) => ({ batch_no: i.batch_no, certificate: i.result === "released" })),
      };
    })
    .sort((a, b) => Number(b.left > 0) - Number(a.left > 0) || b.left - a.left);

  // Batches, newest first, with their entries.
  const batches: { key: string; orderId: string; batch: string; total: number; entries: GoodsRow[] }[] = [];
  for (const g of goods) {
    const key = `${g.order_id}|${batchKey(g.batch_no)}`;
    let b = batches.find((x) => x.key === key);
    if (!b) {
      b = { key, orderId: g.order_id, batch: g.batch_no, total: 0, entries: [] };
      batches.push(b);
    }
    b.total += Number(g.quantity);
    b.entries.push(g);
  }

  // Released batches of the last 60 days with nothing recorded: their certificate has no produced quantity yet.
  const since = addDays(today, -60);
  const missing = inspections.filter((i) => i.result === "released" && i.inspected_at.slice(0, 10) >= since && !totals[`${i.order_id}|${batchKey(i.batch_no)}`]);
  const week = goods.filter((g) => g.produced_on >= addDays(today, -6));
  const weekTotal = week.reduce((s, g) => s + Number(g.quantity), 0);
  const todayTotal = goods.filter((g) => g.produced_on === today).reduce((s, g) => s + Number(g.quantity), 0);

  return (
    <>
      <OpsHeader
        crumb={{ label: "Production", href: "/ops/production", current: "Produced goods" }}
        title="Produced goods"
        sub="The good crowns produced for each batch of an order, entered by hand. The batch's Certificate of Analysis shows the total as its Quantity."
        actions={<InternalOnly>Internal · customers see only the batch total, on its certificate</InternalOnly>}
      />

      <KpiStrip
        items={[
          { label: "Recorded today", value: formatQty(todayTotal), sub: "crowns" },
          { label: "Last 7 days", value: formatQty(weekTotal), sub: `crowns · ${week.length} entr${week.length === 1 ? "y" : "ies"}` },
          { label: "Batches recorded", value: batches.length, sub: "in all" },
          {
            label: "Released, no quantity",
            value: missing.length,
            sub: missing.length ? `last 60 days: ${missing.slice(0, 3).map((i) => i.batch_no).join(", ")}${missing.length > 3 ? "…" : ""}` : "every released batch has its quantity",
            warn: missing.length > 0,
          },
        ]}
      />

      <div className={`grid grid-cols-[minmax(0,1fr)] ${canEnter ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
        {canEnter && (
          <section className="border-b-2 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
            <SectionHead title="Record produced goods" aside="per batch" />
            <div className="mt-3">
              <ProducedGoodsForm orders={orders} totals={totals} today={today} />
            </div>
          </section>
        )}

        <section className="flex min-w-0 flex-col border-b-2 border-divider px-4 py-6 sm:px-8">
          <SectionHead title="By batch" aside={`${batches.length} batch${batches.length === 1 ? "" : "es"}`} />
          {batches.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">Nothing recorded yet.</p>}
          {batches.map((b) => {
            const o = orderById.get(b.orderId);
            const insp = inspectionFor(b.orderId, b.batch);
            return (
              <div key={b.key} className="border-b border-divider py-3 text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0">
                    <b className="text-[15px]">Batch {b.batch}</b>
                    <span className="opacity-75">
                      {" "}
                      · {o ? `${o.order_no} · ${shortCompany(o.companies?.name)} · ${o.brands?.name ?? ""}` : "order closed"}
                    </span>
                  </span>
                  <b className="tabular-nums">
                    {n(b.total)} crowns
                    <span className="font-normal opacity-70">{cartons(b.total)}</span>
                  </b>
                </div>
                <div className="mt-1 text-[12px]">
                  {insp ? (
                    <>
                      <a href={`/certificates/${insp.id}`} target="_blank" rel="noreferrer" className="font-semibold">
                        Certificate ↗
                      </a>
                      <span className="opacity-70">
                        {" "}
                        · {insp.result === "released" ? (insp.published ? "released and published" : "released, not published yet") : insp.result === "on_hold" ? "on hold" : "inspected"}
                      </span>
                    </>
                  ) : (
                    <span className="opacity-70">No inspection with this batch number yet: the certificate shows the quantity once it is inspected under the same number.</span>
                  )}
                </div>
                <ul className="m-0 mt-1.5 list-none p-0">
                  {b.entries.map((g) => (
                    <li key={g.id} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-start gap-3 py-1 text-[12px]">
                      <span className="opacity-75">{formatDayMonth(g.produced_on)}</span>
                      <span className="min-w-0">
                        <b className="tabular-nums">{n(Number(g.quantity))}</b>
                        {g.profiles?.full_name ? <span className="opacity-60"> · {g.profiles.full_name}</span> : null}
                        {g.notes && <span className="block truncate opacity-60">{g.notes}</span>}
                      </span>
                      <span className="flex gap-3">
                        {canEnter && o && (
                          <EditProducedGoods
                            orders={orders}
                            totals={totals}
                            today={today}
                            entry={{ id: g.id, order_id: g.order_id, batch_no: g.batch_no, quantity: Number(g.quantity), produced_on: g.produced_on, notes: g.notes }}
                          />
                        )}
                        {canDelete && <DeleteProducedGoods id={g.id} />}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
