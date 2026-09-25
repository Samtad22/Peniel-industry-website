import type { Metadata } from "next";
import Link from "next/link";
import OpsHeader from "@/components/ops/OpsHeader";
import Bars from "@/components/ui/Bars";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { loadEntries, loadLines, loadProducibleOrders } from "@/lib/production";
import { addDays, lastDays, rejectPct, REJECT_LIMIT_PCT } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Production" };

/**
 * Production home (design 1b), from the entries staff record. OEE, downtime
 * and live line speeds need machine data the portal doesn't collect yet.
 */
export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const me = await requireStaff(opsRolesFor("production"));
  const { range: r } = await searchParams;
  const range = r === "week" ? "week" : "today";
  const today = addisDateISO(new Date());
  const from = range === "week" ? addDays(today, -6) : today;
  const supabase = await createClient();

  const [entries, lines, orders] = await Promise.all([
    loadEntries(supabase, { from: addDays(today, -13), to: today }),
    loadLines(supabase),
    loadProducibleOrders(supabase),
  ]);
  const inRange = entries.filter((e) => e.entry_date >= from);
  const produced = inRange.reduce((s, e) => s + e.produced, 0);
  const rejects = inRange.reduce((s, e) => s + e.rejects, 0);
  const pct = rejectPct(rejects, produced);
  const unpublished = orders.reduce((s, o) => s + o.unpublished, 0);
  const canEnter = me.role === "admin" || me.role === "production";
  const days8 = lastDays(today, 8);

  const kpi = "border-b-2 border-l-2 border-divider px-4 py-5 sm:px-8";

  return (
    <>
      <OpsHeader
        title={range === "week" ? "Production · last 7 days" : "Production · today"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg">
              <Link href="/ops/production" className={`seg-opt no-underline ${range === "today" ? "!bg-accent !text-bg" : "text-text"}`}>
                Today
              </Link>
              <Link href="/ops/production?range=week" className={`seg-opt no-underline ${range === "week" ? "!bg-accent !text-bg" : "text-text"}`}>
                7 days
              </Link>
            </div>
            {canEnter && (
              <Link href="/production-entry" className="btn btn-primary">
                + Daily entry
              </Link>
            )}
          </div>
        }
      />

      <div className="overflow-hidden">
        <div className="-ml-0.5 grid grid-cols-2 xl:grid-cols-4">
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Output {range === "week" ? "· 7 days" : "today"}</h6>
            <div className="kpi">{formatQty(produced)}</div>
            <div className="text-[12px]">{inRange.length} entries</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Camera reject rate</h6>
            <div className={`kpi ${pct > REJECT_LIMIT_PCT ? "text-accent-700" : ""}`}>{produced ? `${pct.toFixed(2)}%` : "-"}</div>
            <div className="text-[12px]">limit {REJECT_LIMIT_PCT.toFixed(2)}%</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Orders on the lines</h6>
            <div className="kpi">{orders.filter((o) => o.status === "in_production").length}</div>
            <div className="text-[12px]">{orders.filter((o) => o.status === "scheduled" || o.status === "confirmed").length} waiting to start</div>
          </div>
          <div className={`${kpi} ${unpublished ? "bg-accent text-bg" : ""}`}>
            <h6 className={unpublished ? "m-0" : "m-0 opacity-60"}>Not yet published</h6>
            <div className="kpi">{unpublished}</div>
            <div className="text-[12px]">{unpublished ? "entries customers can't see yet" : "customers are up to date"}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="-ml-0.5 grid sm:grid-cols-2 xl:grid-cols-4">
          {lines.map((l) => {
            const mine = inRange.filter((e) => e.line === l.name);
            const out = mine.reduce((s, e) => s + e.produced, 0);
            const perDay = days8.map((d) => ({
              label: `${formatDayMonth(d)} · ${formatQty(entries.filter((e) => e.line === l.name && e.entry_date === d).reduce((s, e) => s + e.produced, 0))}`,
              value: entries.filter((e) => e.line === l.name && e.entry_date === d).reduce((s, e) => s + e.produced, 0),
            }));
            const running = [...new Set(mine.map((e) => e.order_no))];
            return (
              <div key={l.id} className="flex flex-col gap-2.5 border-b-2 border-l-2 border-divider px-4 py-5 sm:px-6">
                <h5 className="m-0">{l.name}</h5>
                <div className="text-[32px] font-extrabold leading-none">
                  {formatQty(out)}
                  <span className="text-[13px] font-normal"> crowns {range === "week" ? "· 7 days" : "today"}</span>
                </div>
                <Bars bars={perDay} height={48} gap={3} title={`${l.name}: output per day, last 8 days`} />
                <div className="text-[12px] opacity-70">{running.length ? running.join(" · ") : "No entries in this period"}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h4 className="m-0">Orders in production</h4>
          <span className="text-[12px] opacity-60">Click an order to see its records and publish to the customer</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="th-row grid grid-cols-[100px_minmax(0,1.4fr)_150px_minmax(0,1fr)_90px_110px_110px] gap-3 border-b-2 border-divider py-2">
              <span>Order</span>
              <span>Customer · brand</span>
              <span>Status</span>
              <span>Produced / ordered</span>
              <span>Due</span>
              <span>Last entry</span>
              <span>Unpublished</span>
            </div>
            {orders.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No confirmed orders.</p>}
            {orders.map((o) => {
              const pctDone = o.quantity ? Math.min(100, Math.round((o.good / o.quantity) * 100)) : 0;
              return (
                <Link
                  key={o.id}
                  href={`/ops/production/${o.id}`}
                  className="grid grid-cols-[100px_minmax(0,1.4fr)_150px_minmax(0,1fr)_90px_110px_110px] items-center gap-3 border-b border-divider py-2.5 text-[13px] text-text no-underline hover:bg-text/5 hover:text-text"
                >
                  <b>{o.order_no}</b>
                  <span className="truncate">
                    {o.company} · {o.brand}
                  </span>
                  <span>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="relative h-1.5 flex-1 bg-surface">
                      <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pctDone}%` }} />
                    </span>
                    <span className="w-[92px] text-right tabular-nums">
                      {formatQty(o.good)} / {formatQty(o.quantity)}
                    </span>
                  </span>
                  <span>{formatDayMonth(o.due_date)}</span>
                  <span>{o.last_entry ? formatDate(o.last_entry) : "-"}</span>
                  <span className={o.unpublished ? "font-extrabold text-accent-700" : "opacity-60"}>
                    {o.unpublished ? `${o.unpublished} to publish` : "-"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        <p className="mb-0 mt-3 text-[12px] opacity-60">
          OEE, downtime and live line speeds need machine data that the portal doesn&apos;t collect yet.
        </p>
      </div>
    </>
  );
}
