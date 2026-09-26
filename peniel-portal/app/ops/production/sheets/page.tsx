import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import PrintRunForm, { DeletePrintRunButton, type PrintOrder } from "@/components/ops/PrintRunForm";
import { InkSwatches } from "@/components/ui/Crown";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { formatSpoiledPct, printTotals, type PrintRun } from "@/lib/print-runs";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Printed sheets" };

type RunRow = PrintRun & {
  created_at: string;
  orders: { order_no: string; quantity: number; companies: { name: string } | null; brands: { name: string } | null } | null;
};
type OrderRow = { id: string; order_no: string; quantity: number; status: string; companies: { name: string } | null; brands: { name: string; colours: string[] } | null };

/** Orders the coat & print line can print sheets for. */
const PRINTABLE = ["scheduled", "in_production", "quality_check", "on_hold"];

/** Printed sheets (coat & print line). Internal only: customers never see print runs. */
export default async function PrintedSheetsPage() {
  const me = await requireStaff(opsRolesFor("sheets"));
  const canEnter = me.role === "admin" || me.role === "production";
  const today = addisDateISO(new Date());
  const supabase = await createClient();

  const [{ data: runData }, { data: orderData }] = await Promise.all([
    supabase
      .from("print_runs")
      .select(
        "id, order_id, run_date, shift, colours, sheets_printed, sheets_spoiled, crowns_per_sheet, coating, lacquer, oven_temp_c, coil_lot, notes, created_at, orders(order_no, quantity, companies(name), brands(name))",
      )
      .gte("run_date", addDays(today, -60))
      .order("run_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<RunRow[]>(),
    supabase
      .from("orders")
      .select("id, order_no, quantity, status, companies(name), brands(name, colours)")
      .in("status", PRINTABLE)
      .order("order_no", { ascending: false })
      .returns<OrderRow[]>(),
  ]);
  const runs = runData ?? [];
  const orders = orderData ?? [];

  const todayT = printTotals(runs.filter((r) => r.run_date === today));
  const weekT = printTotals(runs.filter((r) => r.run_date >= addDays(today, -6)));
  const lastPerSheet = (orderId: string) => runs.find((r) => r.order_id === orderId)?.crowns_per_sheet ?? null;
  const formOrders: PrintOrder[] = orders.map((o) => ({
    id: o.id,
    label: `${o.order_no} · ${o.companies?.name.split(" ")[0] ?? ""} · ${o.brands?.name ?? ""} · ${formatQty(Number(o.quantity))}`,
    colours: o.brands?.colours ?? [],
    perSheet: lastPerSheet(o.id),
  }));
  const distinct = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].slice(0, 20);

  // Per order: good sheets, spoiled, and the crowns they'll yield against the order.
  const byOrder = [...new Set(runs.map((r) => r.order_id))]
    .map((id) => {
      const mine = runs.filter((r) => r.order_id === id);
      return { id, o: mine[0].orders, colours: mine[0].colours, t: printTotals(mine) };
    })
    .sort((a, b) => (b.t.lastRun ?? "").localeCompare(a.t.lastRun ?? ""));

  const kpi = "border-b-2 border-l-2 border-divider px-4 py-5 sm:px-8";
  const ORDER_COLS = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_90px_80px_minmax(0,1.3fr)] items-center gap-3";
  const RUN_COLS = "grid grid-cols-[100px_50px_minmax(0,1.2fr)_100px_90px_80px_minmax(0,1.6fr)_60px] items-center gap-3";

  return (
    <>
      <OpsHeader
        crumb={{ label: "Production", href: "/ops/production", current: "Printed sheets" }}
        title="Printed sheets"
        sub="Coat & print line: tinplate sheets coated, lacquered and printed before the presses."
        actions={<InternalOnly>Internal only · customers never see print runs</InternalOnly>}
      />

      <div className="overflow-hidden">
        <div className="-ml-0.5 grid grid-cols-2 xl:grid-cols-4">
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Good sheets today</h6>
            <div className="kpi">{todayT.printed.toLocaleString("en-US")}</div>
            <div className="text-[12px]">{todayT.runs} runs</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Spoiled today</h6>
            <div className="kpi">{formatSpoiledPct(todayT.printed, todayT.spoiled)}</div>
            <div className="text-[12px]">{todayT.spoiled.toLocaleString("en-US")} sheets</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Crowns from today&apos;s sheets</h6>
            <div className="kpi">{todayT.crowns ? formatQty(todayT.crowns) : "-"}</div>
            <div className="text-[12px]">good sheets × crowns per sheet</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Last 7 days</h6>
            <div className="kpi">{weekT.printed.toLocaleString("en-US")}</div>
            <div className="text-[12px]">
              good sheets · {formatSpoiledPct(weekT.printed, weekT.spoiled)} spoiled · {weekT.crowns ? formatQty(weekT.crowns) : "0"} crowns
            </div>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-[minmax(0,1fr)] ${canEnter ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
        {canEnter && (
          <section className="border-b-2 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
            <h4 className="mb-4 mt-0">Log a print run</h4>
            <PrintRunForm
              today={today}
              orders={formOrders}
              coatings={distinct(runs.map((r) => r.coating))}
              lacquers={distinct(runs.map((r) => r.lacquer))}
            />
          </section>
        )}
        <section className="min-w-0 border-b-2 border-divider px-4 py-6 sm:px-8">
          <h4 className="mb-1 mt-0">By order · last 60 days</h4>
          <p className="mb-3 mt-0 text-[12px] opacity-60">Crowns = good sheets × crowns per sheet, before the presses and camera.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className={`${ORDER_COLS} th-row border-b-2 border-divider py-2`}>
                <span>Order</span>
                <span>Colours</span>
                <span className="text-right">Good sheets</span>
                <span className="text-right">Spoiled</span>
                <span>Crowns from sheets</span>
              </div>
              {byOrder.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No print runs yet.</p>}
              {byOrder.map(({ id, o, colours, t }) => {
                const qty = Number(o?.quantity ?? 0);
                const share = qty ? Math.min(100, Math.round((100 * t.crowns) / qty)) : 0;
                return (
                  <div key={id} className={`${ORDER_COLS} border-b border-divider py-2.5 text-[13px]`}>
                    <Link href={`/ops/orders/${id}`} className="min-w-0 break-words font-extrabold">
                      {o?.brands?.name ?? "-"} · {o?.order_no ?? "-"}
                    </Link>
                    <span className="min-w-0 text-[12px]">
                      <InkSwatches colours={colours} compact />
                    </span>
                    <span className="text-right tabular-nums">{t.printed.toLocaleString("en-US")}</span>
                    <span className="text-right tabular-nums" title={`${t.spoiled.toLocaleString("en-US")} sheets spoiled`}>
                      {formatSpoiledPct(t.printed, t.spoiled)}
                    </span>
                    <span className="flex flex-col gap-1">
                      <span>
                        <b>{formatQty(t.crowns)}</b> of {formatQty(qty)}
                        <span className="opacity-60"> · last {t.lastRun ? formatDayMonth(t.lastRun) : "-"}</span>
                      </span>
                      <span className="h-1.5 bg-surface">
                        <span className="block h-full bg-text" style={{ width: `${share}%` }} />
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="px-4 pb-8 pt-6 sm:px-8">
        <h4 className="mb-3 mt-0">Recent runs</h4>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={`${RUN_COLS} th-row border-b-2 border-divider py-2`}>
              <span>Date</span>
              <span>Shift</span>
              <span>Order</span>
              <span className="text-right">Good</span>
              <span className="text-right">Spoiled</span>
              <span className="text-right">Per sheet</span>
              <span>Coating · lacquer · oven · coil</span>
              <span />
            </div>
            {runs.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No print runs in the last 60 days.</p>}
            {runs.slice(0, 40).map((r) => (
              <div key={r.id} className={`${RUN_COLS} border-b border-divider py-2 text-[13px]`} title={r.notes ?? undefined}>
                <span>{formatDate(r.run_date)}</span>
                <span>{r.shift}</span>
                <span className="truncate">
                  {r.orders?.brands?.name ?? "-"} · {r.orders?.order_no ?? "-"}
                </span>
                <span className="text-right tabular-nums">{r.sheets_printed.toLocaleString("en-US")}</span>
                <span className={`text-right tabular-nums ${r.sheets_spoiled ? "font-extrabold text-accent-700" : ""}`}>
                  {r.sheets_spoiled.toLocaleString("en-US")}
                </span>
                <span className="text-right tabular-nums">{r.crowns_per_sheet.toLocaleString("en-US")}</span>
                <span className="truncate">
                  {[r.coating, r.lacquer, r.oven_temp_c != null ? `${Number(r.oven_temp_c)} °C` : null, r.coil_lot].filter(Boolean).join(" · ") || "-"}
                </span>
                {canEnter ? <DeletePrintRunButton id={r.id} /> : <span />}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
