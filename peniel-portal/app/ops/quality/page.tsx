import type { Metadata } from "next";
import Link from "next/link";
import { setInspectionPublished } from "@/app/ops/quality/actions";
import { OpsTopBar } from "@/components/ops/OpsHeader";
import { DeleteSortingButton, SortingDialog } from "@/components/ops/SortingForms";
import { Pill } from "@/components/ui/StatusBadge";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { addDays, REJECT_LIMIT_PCT } from "@/lib/production-math";
import { CROWN_HEIGHT, measureValue, RESULT_PILL, risingTrend } from "@/lib/qc";
import { opsRolesFor } from "@/lib/roles";
import { formatCartons, formatWastePct, orderSorting, type SortingRecord } from "@/lib/sorting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quality control" };

type Row = {
  id: string;
  batch_no: string;
  order_id: string;
  inspected_at: string;
  sample_size: number;
  measurements: Record<string, unknown>;
  reject_pct: number;
  result: "released" | "on_hold" | null;
  published: boolean;
  qc_defects: { defect_type: string; count: number }[];
  orders: { order_no: string; companies: { name: string } | null; brands: { name: string } | null } | null;
};

type SortRow = SortingRecord & { created_at: string };
type SortOrder = { id: string; order_no: string; status: string; companies: { name: string } | null; brands: { name: string } | null };

/** Orders whose runs can still send camera rejects to sorting. */
const SORTING_STATUSES = ["scheduled", "in_production", "quality_check", "on_hold", "ready_for_pickup", "dispatched"];

const FILTERS = { all: "All", held: "Held", unpublished: "Unpublished" } as const;

/** Quality control overview (design 1i). */
export default async function QualityPage({ searchParams }: { searchParams: Promise<{ f?: string; saved?: string }> }) {
  const me = await requireStaff(opsRolesFor("quality"));
  const { f: rawF, saved } = await searchParams;
  const f = rawF === "held" || rawF === "unpublished" ? rawF : "all";
  const canEdit = me.role === "admin" || me.role === "quality";
  const today = addisDateISO(new Date());
  const supabase = await createClient();

  const [{ data }, { data: types }, { data: sortData }] = await Promise.all([
    supabase
      .from("qc_inspections")
      .select(
        "id, batch_no, order_id, inspected_at, sample_size, measurements, reject_pct, result, published, qc_defects(defect_type, count), orders(order_no, companies(name), brands(name))",
      )
      .order("inspected_at", { ascending: false })
      .limit(300)
      .returns<Row[]>(),
    supabase.from("defect_types").select("code, customer_label").returns<{ code: string; customer_label: string }[]>(),
    supabase
      .from("sorting_records")
      .select("id, order_id, batch_no, sorted_on, passed_cartons, waste_cartons, reported_by, notes, created_at")
      .order("sorted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<SortRow[]>(),
  ]);
  const sortings = sortData ?? [];

  // Sorting (internal): orders in production, plus orders sorted recently, with their camera rejects.
  const { data: activeOrders } = await supabase
    .from("orders")
    .select("id, order_no, status, companies(name), brands(name)")
    .or(`status.in.(${SORTING_STATUSES.join(",")}),id.in.(${[...new Set(sortings.map((x) => x.order_id))].join(",") || "00000000-0000-0000-0000-000000000000"})`)
    .order("order_no", { ascending: false })
    .limit(200)
    .returns<SortOrder[]>();
  const sortOrders = activeOrders ?? [];
  const { data: runs } = sortOrders.length
    ? await supabase
        .from("production_entries")
        .select("order_id, produced_qty, reject_qty")
        .in("order_id", sortOrders.map((o) => o.id))
        .returns<{ order_id: string; produced_qty: number; reject_qty: number }[]>()
    : { data: [] };
  const all = data ?? [];
  const label = new Map((types ?? []).map((t) => [t.code, t.customer_label]));

  const week = all.filter((r) => r.inspected_at.slice(0, 10) >= addDays(today, -6));
  const byType = new Map<string, number>();
  for (const r of week) for (const d of r.qc_defects) byType.set(d.defect_type, (byType.get(d.defect_type) ?? 0) + d.count);
  const defects = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const topDefect = defects[0]?.[1] ?? 1;
  const sampled = week.reduce((s, r) => s + r.sample_size, 0);
  const rejected = defects.reduce((s, [, n]) => s + n, 0);

  const heights = all
    .map((r) => ({ label: `${r.batch_no} · ${formatDayMonth(r.inspected_at)}`, value: measureValue(r.measurements, CROWN_HEIGHT.key) }))
    .filter((p): p is { label: string; value: number } => p.value != null)
    .slice(0, 30)
    .reverse();
  const trend = risingTrend(heights.map((p) => p.value));

  const orderLabel = (o: SortOrder | undefined) => (o ? `${o.brands?.name ?? "-"} · ${o.order_no}` : "-");
  const orderById = new Map(sortOrders.map((o) => [o.id, o]));
  const sortRows = sortOrders
    .map((o) => {
      const mine = (runs ?? []).filter((r) => r.order_id === o.id);
      const produced = mine.reduce((t, r) => t + Number(r.produced_qty), 0);
      const camera = mine.reduce((t, r) => t + Number(r.reject_qty), 0);
      return { o, t: orderSorting(produced, camera, sortings.filter((x) => x.order_id === o.id)) };
    })
    .filter(({ t }) => t.camera > 0 || t.reports > 0)
    .sort((a, b) => b.t.waiting - a.t.waiting || (b.t.lastSorted ?? "").localeCompare(a.t.lastSorted ?? ""))
    .slice(0, 30);
  const sortOptions = sortOrders
    .filter((o) => SORTING_STATUSES.includes(o.status))
    .map((o) => ({
      id: o.id,
      label: `${orderLabel(o)} · ${o.companies?.name ?? ""}`,
      batches: [...new Set([...all.filter((r) => r.order_id === o.id).map((r) => r.batch_no), ...sortings.filter((x) => x.order_id === o.id).map((x) => x.batch_no)])].sort(),
    }));
  const SORT_COLS = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_90px_80px_80px_80px_80px_110px_100px] items-center gap-2.5";
  const REPORT_COLS = "grid grid-cols-[100px_minmax(0,1.6fr)_90px_90px_90px_70px_minmax(0,1fr)_60px] items-center gap-2.5";

  const rows = all.filter((r) => (f === "held" ? r.result === "on_hold" : f === "unpublished" ? !r.published : true));
  // The poster: the oldest held batch, else the latest inspection.
  const held = all.filter((r) => r.result === "on_hold");
  const focus = held.at(-1) ?? all[0] ?? null;

  return (
    <>
      <OpsTopBar>
        {canEdit && (
          <Link href="/ops/quality/new" className="btn btn-primary">
            + Log inspection
          </Link>
        )}
      </OpsTopBar>
      {saved && <p className="m-0 bg-neutral-200 px-4 py-2.5 text-[13px] sm:px-8">Batch {saved} saved.</p>}

      <div className="grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {focus ? (
          <div className={`flex flex-col gap-3.5 px-4 py-7 text-bg sm:px-8 ${focus.result === "on_hold" ? "bg-accent-800" : "bg-text"}`}>
            <span className="font-mono text-[11px] font-semibold tracking-[.1em]">
              {focus.result === "on_hold" ? `❚❚ HELD · NEEDS A DECISION${held.length > 1 ? ` · 1 OF ${held.length}` : ""}` : "LATEST BATCH · NOTHING ON HOLD"}
            </span>
            <h1 className="m-0 break-words text-[52px] leading-[.88] tracking-[-.05em] text-bg sm:text-[72px]">
              Batch
              <br />
              {focus.batch_no}
            </h1>
            <div className="grid grid-cols-2 border-t-2 border-accent-500 pt-3">
              <div>
                <span className="text-[11px] opacity-80">REJECT RATE</span>
                <div className="text-[40px] font-extrabold leading-none tracking-[-.04em] sm:text-[48px]">{Number(focus.reject_pct).toFixed(2)}%</div>
              </div>
              <div>
                <span className="text-[11px] opacity-80">LIMIT</span>
                <div className="text-[40px] font-extrabold leading-none tracking-[-.04em] opacity-55 sm:text-[48px]">{REJECT_LIMIT_PCT.toFixed(2)}%</div>
              </div>
            </div>
            <span className="text-[14px]">
              {focus.orders?.brands?.name ?? "-"} · {focus.orders?.order_no ?? "-"} · {focus.orders?.companies?.name ?? ""} · inspected {formatDate(focus.inspected_at)}, sample of{" "}
              {focus.sample_size.toLocaleString("en-US")}.
              {measureValue(focus.measurements, CROWN_HEIGHT.key) != null && ` Shell height ${measureValue(focus.measurements, CROWN_HEIGHT.key)!.toFixed(2)} mm (spec ${CROWN_HEIGHT.spec}).`}
            </span>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={`/ops/quality/${focus.id}`} className="btn flex-1 justify-between bg-bg !text-text hover:bg-neutral-200">
                {focus.result === "on_hold" ? "Decide" : "Open"}
                <span aria-hidden="true">→</span>
              </Link>
              <Link href={`/ops/orders/${focus.order_id}/preview`} target="_blank" className="btn flex-1 justify-between border-2 border-bg !text-bg hover:bg-bg/10">
                Customer view ↗
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-end gap-3 bg-text px-4 py-7 text-bg sm:px-8">
            <span className="font-mono text-[11px] font-semibold tracking-[.1em]">NO INSPECTIONS YET</span>
            <h1 className="m-0 text-[52px] leading-[.88] tracking-[-.05em] text-bg sm:text-[72px]">Quality control</h1>
          </div>
        )}
        <div className="bg-text px-4 py-6 text-bg sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-bg">Shell height · last {heights.length} batches</h3>
            <span className="border border-neutral-600 px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[.1em]">🔒︎ INTERNAL</span>
          </div>
          <div className="mb-4 mt-1 text-[12px] opacity-60">spec {CROWN_HEIGHT.spec} mm · oldest on the left</div>
          <HeightChart points={heights} />
          {trend && (
            <div className="mt-2.5 text-[13px] font-extrabold text-accent">
              ⚠ The last 7 batches keep rising. Check the tooling before it goes past the upper limit.
            </div>
          )}
        </div>
      </div>

      <div className="grid border-y-2 border-divider xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="border-divider px-4 py-6 sm:px-8 xl:border-r-2">
          <div className="mb-3.5 flex items-baseline justify-between gap-2 border-b-2 border-text pb-2">
            <h3 className="m-0">Defects · 7 days</h3>
            <span className="text-[12px] opacity-70">
              {rejected.toLocaleString("en-US")} of {formatQty(sampled)} sampled
            </span>
          </div>
          {defects.length === 0 && <p className="m-0 text-[13px] opacity-60">No defects recorded this week.</p>}
          {defects.map(([code, n], i) => (
            <div key={code} className="mb-3 grid grid-cols-[1fr_50px] gap-x-2.5 gap-y-1 text-[13px]" title={`${label.get(code) ?? code}: ${n}`}>
              <span>{label.get(code) ?? code}</span>
              <b className="text-right">{n.toLocaleString("en-US")}</b>
              <div className="col-span-2 h-2.5 bg-surface">
                <div className={`h-full ${i === 0 ? "bg-accent" : "bg-text"}`} style={{ width: `${(n / topDefect) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="mt-1.5 border-t border-divider pt-2.5">
            <CustomerSees>Each customer sees only their own published batches</CustomerSees>
          </div>
        </div>
        <BatchTable rows={rows} f={f} canEdit={canEdit} heldCount={held.length} unpublishedCount={all.filter((r) => !r.published).length} />
      </div>

      <div id="sorting" className="border-b-2 border-divider px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="m-0">Sorting · camera rejects</h4>
            <InternalOnly>Internal only · customers see only the reject rate after sorting</InternalOnly>
          </div>
          {canEdit && <SortingDialog orders={sortOptions} today={today} />}
        </div>
        <div className="mb-3 text-[12px] opacity-60">
          Cartons the liner camera pushed out on each run, sorted by hand: passed crowns stay internal, waste is the customer&apos;s reject rate
          after sorting. Counts in cartons: 1 carton = 10,000 crowns.
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1060px]">
            <div className={`${SORT_COLS} th-row border-b-2 border-divider py-2`}>
              <span>Order</span>
              <span>Customer</span>
              <span>Camera rejects</span>
              <span>Sorted</span>
              <span>Passed</span>
              <span>Waste</span>
              <span>To sort</span>
              <span>Reject rate after sorting</span>
              <span>Last report</span>
            </div>
            {sortRows.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No camera rejects logged on the orders in production.</p>}
            {sortRows.map(({ o, t }) => (
              <div key={o.id} className={`${SORT_COLS} border-b border-divider py-2.5 text-[13px]`}>
                <Link href={`/ops/orders/${o.id}`} className="truncate font-extrabold">
                  {orderLabel(o)}
                </Link>
                <span className="truncate">{o.companies?.name ?? "-"}</span>
                <span>{formatCartons(t.camera)}</span>
                <span>{t.reports ? t.sorted : "-"}</span>
                <span>{t.reports ? t.passed : "-"}</span>
                <span className={t.waste ? "font-extrabold text-accent-700" : undefined}>{t.reports ? t.waste : "-"}</span>
                <span className={t.waiting ? "font-extrabold" : "opacity-60"}>{t.waiting ? formatCartons(t.waiting) : "0"}</span>
                <span>{t.rejectPct == null ? <span className="opacity-60">Not sorted yet</span> : `${t.rejectPct.toFixed(2)}%`}</span>
                <span>{t.lastSorted ? formatDate(t.lastSorted) : "-"}</span>
              </div>
            ))}
          </div>
        </div>

        {sortings.length > 0 && (
          <>
            <h5 className="mb-2 mt-6">Recent sorting reports</h5>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className={`${REPORT_COLS} th-row border-b-2 border-divider py-2`}>
                  <span>Date</span>
                  <span>Order · batch</span>
                  <span>Sorted</span>
                  <span>Passed</span>
                  <span>Waste</span>
                  <span>Waste %</span>
                  <span>Reported by</span>
                  <span />
                </div>
                {sortings.slice(0, 15).map((x) => {
                  return (
                    <div key={x.id} className={`${REPORT_COLS} border-b border-divider py-2 text-[13px]`} title={x.notes ?? undefined}>
                      <span>{formatDate(x.sorted_on)}</span>
                      <span className="truncate">
                        {orderLabel(orderById.get(x.order_id))} · batch {x.batch_no}
                      </span>
                      <span>{x.passed_cartons + x.waste_cartons}</span>
                      <span>{x.passed_cartons}</span>
                      <span className={x.waste_cartons ? "font-extrabold text-accent-700" : undefined}>{x.waste_cartons}</span>
                      <span>{formatWastePct(x.passed_cartons, x.waste_cartons)}</span>
                      <span className="truncate">{x.reported_by ?? "-"}</span>
                      {canEdit ? <DeleteSortingButton id={x.id} /> : <span />}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

    </>
  );
}

/** Shell height per batch on the dark panel (design 2e): the CoA limits dashed, out-of-limit points red. */
function HeightChart({ points }: { points: { label: string; value: number }[] }) {
  const lo = CROWN_HEIGHT.min!;
  const hi = CROWN_HEIGHT.max!;
  const pad = (hi - lo) * 0.35;
  const min = Math.min(lo - pad, ...points.map((p) => p.value));
  const max = Math.max(hi + pad, ...points.map((p) => p.value));
  const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 300 : 150);
  if (!points.length) return <p className="m-0 text-[13px] opacity-60">No shell heights recorded yet.</p>;
  return (
    <div className="relative h-[230px] border-b-2 border-l-2 border-neutral-600" role="img" aria-label="Shell height per batch against the CoA limits">
      <div className="absolute inset-x-0 border-t-2 border-dashed border-accent" style={{ top: `${y(hi)}%` }} />
      <span className="absolute right-1 text-[11px] text-accent" style={{ top: `calc(${y(hi)}% - 18px)` }}>
        USL {hi.toFixed(2)}
      </span>
      <div className="absolute inset-x-0 border-t border-neutral-700" style={{ top: `${y((lo + hi) / 2)}%` }} />
      <div className="absolute inset-x-0 border-t-2 border-dashed border-accent" style={{ top: `${y(lo)}%` }} />
      <span className="absolute right-1 text-[11px] text-accent" style={{ top: `calc(${y(lo)}% - 18px)` }}>
        LSL {lo.toFixed(2)}
      </span>
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <polyline
          fill="none"
          stroke="var(--color-bg)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
        />
      </svg>
      {points.map((p, i) => {
        const out = p.value < lo || p.value > hi;
        return (
          <span
            key={i}
            title={`${p.label}: ${p.value.toFixed(2)} mm`}
            className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 ${out ? "bg-accent" : "bg-bg"}`}
            style={{ left: `${(x(i) / 300) * 100}%`, top: `${y(p.value)}%` }}
          />
        );
      })}
    </div>
  );
}

/** Batch inspections with the publish switch (design 2e). */
function BatchTable({
  rows,
  f,
  canEdit,
  heldCount,
  unpublishedCount,
}: {
  rows: Row[];
  f: keyof typeof FILTERS;
  canEdit: boolean;
  heldCount: number;
  unpublishedCount: number;
}) {
  const COLS = "grid grid-cols-[96px_minmax(0,1fr)_96px_64px_64px_104px_130px] items-center gap-2.5";
  const count: Record<keyof typeof FILTERS, number | null> = { all: null, held: heldCount, unpublished: unpublishedCount };
  return (
    <div className="min-w-0 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-text pb-2">
        <h3 className="m-0">Batch inspections</h3>
        <div className="flex border border-divider text-[12px]">
          {(Object.entries(FILTERS) as [keyof typeof FILTERS, string][]).map(([k, v]) => (
            <Link
              key={k}
              href={k === "all" ? "/ops/quality" : `/ops/quality?f=${k}`}
              className={`px-2.5 py-[5px] no-underline ${f === k ? "bg-text !text-bg" : "text-text hover:bg-text/[.07]"}`}
            >
              {v}
              {count[k] ? ` ${count[k]}` : ""}
            </Link>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`${COLS} th-row border-b border-divider py-2`}>
            <span>Batch</span>
            <span>Customer · brand</span>
            <span>Order</span>
            <span>Height</span>
            <span>Reject</span>
            <span>Result</span>
            <span>Published ◉</span>
          </div>
          {rows.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No inspections here.</p>}
          {rows.map((r) => {
            const held = r.result === "on_hold";
            const pill = r.result ? RESULT_PILL[r.result] : RESULT_PILL.none;
            const pct = Number(r.reject_pct);
            return (
              <div
                key={r.id}
                className={`${COLS} border-b border-divider py-[11px] text-[13px] ${held ? "bg-accent-100 shadow-[inset_4px_0_0_var(--color-accent-800)]" : ""}`}
              >
                <Link href={`/ops/quality/${r.id}`} className="font-extrabold">
                  {r.batch_no}
                </Link>
                <span className="truncate">
                  {r.orders?.companies?.name ?? "-"} · {r.orders?.brands?.name ?? "-"}
                </span>
                <Link href={`/ops/orders/${r.order_id}`} className="text-text">
                  {r.orders?.order_no ?? "-"}
                </Link>
                <span>{measureValue(r.measurements, CROWN_HEIGHT.key)?.toFixed(2) ?? "-"}</span>
                <span className={held || pct > REJECT_LIMIT_PCT ? "font-extrabold text-accent-700" : undefined}>{pct.toFixed(2)}%</span>
                <span>
                  <Pill style={pill.style}>{pill.label}</Pill>
                </span>
                {canEdit ? (
                  <form action={setInspectionPublished} className="flex items-center gap-2 text-[12px]">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="published" value={String(!r.published)} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={r.published}
                      aria-label={`Publish batch ${r.batch_no} to the customer`}
                      className={`relative h-5 w-9 shrink-0 cursor-pointer border-0 ${r.published ? "bg-accent" : "bg-neutral-300"}`}
                    >
                      <span className={`absolute top-[3px] size-3.5 bg-bg ${r.published ? "right-[3px]" : "left-[3px]"}`} />
                    </button>
                    {r.published ? (held ? "Hold shown" : "Live") : "Draft"}
                  </form>
                ) : (
                  <span className="text-[12px]">{r.published ? "Live" : "Draft"}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mb-0 mt-3 text-[12px] opacity-60">
        Shell height in mm: internal only. Customers see the reject rate, defects by type and the result of published batches.
      </p>
    </div>
  );
}
