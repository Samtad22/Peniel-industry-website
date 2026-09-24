import Link from "next/link";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import Bars from "@/components/ui/Bars";
import StatusBadge, { Pill } from "@/components/ui/StatusBadge";
import { formatDate, formatDateTime, formatDayMonth, formatQty } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { REJECT_LIMIT_PCT } from "@/lib/production-math";
import { RESULT_PILL } from "@/lib/qc";

export type ProductionTab = "output" | "quality" | "stock";

export type OutputRow = {
  id: string;
  order_no: string;
  product: string;
  status: OrderStatus;
  quantity: number;
  completed: number;
  today: number;
  projection: string | null;
  perDay: number | null;
  due_date: string | null;
  daily: { date: string; good: number }[];
};

export type BatchRow = {
  id: string;
  batch_no: string;
  order_id: string;
  order_no: string;
  inspected_at: string;
  reject_pct: number;
  result: "released" | "on_hold" | null;
  customer_reason: string | null;
};

export type StockRow = {
  id: string;
  brand_name: string;
  batch_no: string;
  quantity: number;
  ready_since: string;
  status: "available" | "reserved" | "on_hold";
  order_no: string | null;
  customer_reason: string | null;
};

export type ProductionData = {
  tab: ProductionTab;
  lastUpdated: string | null;
  output: OutputRow[];
  quality: { batches: BatchRow[]; filter: "all" | "released" | "on_hold"; defects: { label: string; count: number }[]; sampled: number };
  stock: StockRow[];
};

const STOCK_PILL = {
  available: { label: "Available for pickup", style: { background: "var(--color-text)", color: "var(--color-bg)" } },
  reserved: { label: "Reserved", style: { borderColor: "var(--color-text)" } },
  on_hold: { label: "❚❚ On hold (QC)", style: { background: "var(--color-accent-800)", color: "var(--color-bg)" } },
} as const;

const TITLES: Record<ProductionTab, string> = {
  output: "Your orders in production",
  quality: "Quality of your batches",
  stock: "Your stock at Peniel",
};

function Tabs({ tab, lastUpdated }: { tab: ProductionTab; lastUpdated: string | null }) {
  return (
    <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
      <nav className="seg" aria-label="Production views">
        {(["output", "quality", "stock"] as const).map((t) => (
          <Link
            key={t}
            href={t === "output" ? "/production" : `/production?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={`seg-opt no-underline ${tab === t ? "!bg-accent !text-bg" : "text-text"}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>
      <span className="text-[12px] text-neutral-700">
        {lastUpdated ? `Last updated by Peniel · ${formatDateTime(lastUpdated)} EAT` : "Nothing published by Peniel yet"}
      </span>
    </div>
  );
}

function Output({ rows }: { rows: OutputRow[] }) {
  if (rows.length === 0) {
    return <p className="m-0 px-4 py-10 text-[15px] sm:px-10">No active orders right now. Delivered orders are under Orders.</p>;
  }
  return (
    <>
      {rows.map((o) => {
        const pct = o.quantity ? Math.min(100, Math.round((o.completed / o.quantity) * 100)) : 0;
        const started = o.daily.some((d) => d.good > 0) || o.completed > 0;
        return (
          <div
            key={o.id}
            className="grid border-b-2 border-divider md:grid-cols-3 xl:grid-cols-[280px_repeat(3,160px)_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-2 px-4 py-5 sm:px-10 md:col-span-3 xl:col-span-1 xl:py-6 xl:pr-6">
              <Link href={`/orders/${o.id}`} className="text-[18px] font-extrabold text-text no-underline hover:underline">
                {o.order_no}
              </Link>
              <span className="text-[13px] opacity-70">{o.product}</span>
              <span>
                <StatusBadge status={o.status} audience="customer" />
              </span>
            </div>
            <div className="border-divider px-4 py-4 sm:px-5 max-md:border-t md:border-l xl:py-6">
              <h6 className="m-0 opacity-60">Produced / ordered</h6>
              <div className="text-[26px] font-extrabold leading-[1.2]">{formatQty(o.completed)}</div>
              <div className="text-[13px]">of {formatQty(o.quantity)}</div>
              <div className="mt-2 h-1.5 bg-surface">
                <div className={`h-full ${pct >= 100 ? "bg-text" : "bg-accent"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="border-divider px-4 py-4 sm:px-5 max-md:border-t md:border-l xl:py-6">
              <h6 className="m-0 opacity-60">Produced today</h6>
              <div className="text-[26px] font-extrabold leading-[1.2]">{o.today ? formatQty(o.today) : "—"}</div>
            </div>
            <div className="border-divider px-4 py-4 sm:px-5 max-md:border-t md:border-l xl:py-6">
              <h6 className="m-0 opacity-60">Expected completion</h6>
              <div className="text-[18px] font-extrabold leading-[1.3]">
                {pct >= 100 ? "Completed" : o.projection ? formatDate(o.projection) : "—"}
              </div>
              <div className="text-[12px] opacity-70">
                {pct < 100 && o.perDay ? `At ${formatQty(o.perDay)}/day` : ""}
                {o.due_date ? `${pct < 100 && o.perDay ? " · " : ""}due ${formatDate(o.due_date)}` : ""}
              </div>
            </div>
            <div className="flex flex-col gap-2 border-divider px-4 py-4 sm:px-10 max-xl:border-t md:col-span-3 xl:col-span-1 xl:border-l xl:py-6 xl:pl-6">
              <div className="flex justify-between text-[12px] opacity-70">
                <span>Daily output · last 14 days</span>
                {started && <span>peak {formatQty(Math.max(...o.daily.map((d) => d.good)))}</span>}
              </div>
              {started ? (
                <Bars
                  height={72}
                  gap={4}
                  title={`Daily output of ${o.order_no}, last 14 days`}
                  bars={o.daily.map((d, i) => ({
                    label: `${formatDayMonth(d.date)} · ${formatQty(d.good)}`,
                    value: d.good,
                    hot: i === o.daily.length - 1,
                  }))}
                  start={formatDayMonth(o.daily[0].date)}
                  end={formatDayMonth(o.daily.at(-1)!.date)}
                />
              ) : (
                <div className="flex h-[72px] items-center border-2 border-dashed border-divider px-4 text-[13px] opacity-70">
                  Not started yet.
                </div>
              )}
            </div>
          </div>
        );
      })}
      <p className="m-0 px-4 pb-7 pt-4 text-[12px] text-neutral-700 sm:px-10">
        Shows your active orders only. Delivered orders are under Orders.
      </p>
    </>
  );
}

function Quality({ q }: { q: ProductionData["quality"] }) {
  const recent = [...q.batches].slice(0, 14).reverse();
  const topDefect = Math.max(1, ...q.defects.map((d) => d.count));
  const totalDefects = q.defects.reduce((s, d) => s + d.count, 0);
  const worst = recent.filter((b) => b.reject_pct > REJECT_LIMIT_PCT).at(-1);
  const shown = q.filter === "all" ? q.batches : q.batches.filter((b) => b.result === q.filter);
  if (q.batches.length === 0) {
    return <p className="m-0 px-4 py-10 text-[15px] sm:px-10">No batch results published yet. They appear here after Peniel&apos;s quality team releases them.</p>;
  }
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] border-b-2 border-divider lg:grid-cols-2">
        <div className="border-divider px-4 py-6 sm:px-10 lg:border-r-2">
          <h4 className="mb-0.5 mt-0">Reject rate per batch</h4>
          <div className="mb-3.5 text-[12px] opacity-60">
            Last {recent.length} batches · limit {REJECT_LIMIT_PCT.toFixed(2)}%
          </div>
          <Bars
            height={170}
            gap={5}
            title="Reject rate of your last batches"
            limit={{ value: REJECT_LIMIT_PCT, label: `${REJECT_LIMIT_PCT.toFixed(2)}%` }}
            bars={recent.map((b) => ({
              label: `${b.batch_no} · ${Number(b.reject_pct).toFixed(2)}%`,
              value: Number(b.reject_pct),
              hot: Number(b.reject_pct) > REJECT_LIMIT_PCT,
            }))}
          />
          {worst && (
            <div className="mt-2 text-[12px]">
              <b className="text-accent-700">
                Batch {worst.batch_no} at {Number(worst.reject_pct).toFixed(2)}%
              </b>
              {worst.result === "on_hold" ? " is held for re-inspection." : " was above the limit."}
            </div>
          )}
        </div>
        <div className="px-4 py-6 sm:px-10">
          <h4 className="mb-0.5 mt-0">Defects by type</h4>
          <div className="mb-3.5 text-[12px] opacity-60">
            Last 30 days · {totalDefects.toLocaleString("en-US")} rejects of {formatQty(q.sampled)} sampled
          </div>
          <div className="flex flex-col gap-2.5 text-[13px]">
            {q.defects.length === 0 && <p className="m-0 opacity-60">No defects found in the last 30 days.</p>}
            {q.defects.map((d, i) => (
              <div key={d.label} className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-2.5" title={`${d.label}: ${d.count}`}>
                <span>{d.label}</span>
                <div className="h-4">
                  <div className={`h-full ${i === 0 ? "bg-accent" : "bg-text"}`} style={{ width: `${(d.count / topDefect) * 100}%` }} />
                </div>
                <b className="text-right">{d.count.toLocaleString("en-US")}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pb-10 pt-6 sm:px-10">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <h4 className="m-0">Batch inspections</h4>
          <div className="seg">
            {(
              [
                ["all", "All"],
                ["released", "Released"],
                ["on_hold", "Held"],
              ] as const
            ).map(([k, v]) => (
              <Link
                key={k}
                href={k === "all" ? "/production?tab=quality" : `/production?tab=quality&result=${k}`}
                className={`seg-opt no-underline ${q.filter === k ? "!bg-accent !text-bg" : "text-text"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="th-row grid grid-cols-[110px_120px_130px_100px_130px_minmax(0,1fr)] gap-3 border-b-2 border-divider py-2">
              <span>Batch</span>
              <span>Order</span>
              <span>Date</span>
              <span>Reject %</span>
              <span>Result</span>
              <span>Note from Peniel</span>
            </div>
            {shown.map((b) => {
              const pill = b.result ? RESULT_PILL[b.result] : { label: "Being inspected", style: RESULT_PILL.none.style };
              const pct = Number(b.reject_pct);
              return (
                <div key={b.id} className="grid grid-cols-[110px_120px_130px_100px_130px_minmax(0,1fr)] items-center gap-3 border-b border-divider py-2.5 text-[14px]">
                  <b>{b.batch_no}</b>
                  <Link href={`/orders/${b.order_id}`} className="text-text">
                    {b.order_no}
                  </Link>
                  <span>{formatDate(b.inspected_at)}</span>
                  <span className={pct > REJECT_LIMIT_PCT ? "font-extrabold text-accent-700" : undefined}>{pct.toFixed(2)}%</span>
                  <span>
                    <Pill style={pill.style}>{pill.label}</Pill>
                  </span>
                  <span className={`text-[13px] ${b.result === "on_hold" ? "text-accent-800" : "opacity-70"}`}>{b.customer_reason ?? ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function Stock({ rows }: { rows: StockRow[] }) {
  const sum = (s: StockRow["status"]) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.quantity, 0);
  return (
    <>
      <div className="overflow-hidden">
        <div className="-ml-0.5 grid sm:grid-cols-3">
          <div className="border-b-2 border-l-2 border-divider bg-text px-4 py-5 text-bg sm:px-10">
            <h6 className="m-0">Available for pickup</h6>
            <div className="kpi">{formatQty(sum("available"))}</div>
          </div>
          <div className="border-b-2 border-l-2 border-divider px-4 py-5 sm:px-10">
            <h6 className="m-0 opacity-60">Reserved for dispatch</h6>
            <div className="kpi">{formatQty(sum("reserved"))}</div>
          </div>
          <div className="border-b-2 border-l-2 border-divider px-4 py-5 sm:px-10">
            <h6 className="m-0 opacity-60">On hold (QC)</h6>
            <div className="kpi">{formatQty(sum("on_hold"))}</div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-10 pt-6 sm:px-10">
        {rows.length === 0 ? (
          <p className="m-0 text-[15px]">No finished crowns in stock for you right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="th-row grid grid-cols-[minmax(0,1fr)_110px_130px_130px_180px_120px] gap-3 border-b-2 border-divider py-2">
                <span>Product</span>
                <span>Batch</span>
                <span className="text-right">Quantity</span>
                <span>Ready since</span>
                <span>Status</span>
                <span>For order</span>
              </div>
              {rows.map((s) => (
                <div key={s.id} className="border-b border-divider">
                  <div className="grid grid-cols-[minmax(0,1fr)_110px_130px_130px_180px_120px] items-center gap-3 py-2.5 text-[14px]">
                    <b>{s.brand_name}</b>
                    <span>{s.batch_no}</span>
                    <span className="text-right tabular-nums">{s.quantity.toLocaleString("en-US")}</span>
                    <span>{formatDate(s.ready_since)}</span>
                    <span>
                      <Pill style={STOCK_PILL[s.status].style}>{STOCK_PILL[s.status].label}</Pill>
                    </span>
                    <span>{s.order_no ?? "—"}</span>
                  </div>
                  {s.status === "on_hold" && s.customer_reason && (
                    <p className="m-0 bg-accent-100 px-2 py-2 text-[13px] text-accent-800">{s.customer_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mb-0 mt-3 text-[12px] text-neutral-700">Pickup is at Bole Lemi Industrial Park. Bring the order number and PO.</p>
      </div>
    </>
  );
}

/** Customer Production tab — designs 1j (Output), 1k (Quality), 1l (Stock). */
export default function ProductionView({ d }: { d: ProductionData }) {
  return (
    <>
      <CustomerPageHead section="Production" title={TITLES[d.tab]} aside={<Tabs tab={d.tab} lastUpdated={d.lastUpdated} />} />
      {d.tab === "output" && <Output rows={d.output} />}
      {d.tab === "quality" && <Quality q={d.quality} />}
      {d.tab === "stock" && <Stock rows={d.stock} />}
    </>
  );
}
