import type { Metadata } from "next";
import Link from "next/link";
import { setInspectionPublished } from "@/app/ops/quality/actions";
import OpsHeader from "@/components/ops/OpsHeader";
import { DeleteSortingButton, SortingDialog } from "@/components/ops/SortingForms";
import SpecChart from "@/components/ui/SpecChart";
import { Pill } from "@/components/ui/StatusBadge";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { addDays, REJECT_LIMIT_PCT } from "@/lib/production-math";
import { CROWN_HEIGHT, LEAK_PRESSURE, measureValue, RESULT_PILL, risingTrend } from "@/lib/qc";
import { opsRolesFor } from "@/lib/roles";
import { cartonsLine, formatWastePct, sortingTotals, type SortingRecord } from "@/lib/sorting";
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
      .select("id, inspection_id, sorted_on, passed_cartons, waste_cartons, reported_by, notes, created_at")
      .order("sorted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<SortRow[]>(),
  ]);
  const sortings = sortData ?? [];
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

  // Sorting (internal): every held batch, plus released batches that were sorted.
  const byId = new Map(all.map((r) => [r.id, r]));
  const batchLabel = (r: Row) => `${r.orders?.brands?.name ?? "—"} · batch ${r.batch_no} · ${r.orders?.order_no ?? ""}`;
  const sortBatches = all
    .filter((r) => r.result === "on_hold" || sortings.some((x) => x.inspection_id === r.id))
    .map((r) => ({ r, t: sortingTotals(sortings.filter((x) => x.inspection_id === r.id)) }))
    .sort((a, b) => Number(b.r.result === "on_hold") - Number(a.r.result === "on_hold") || (b.t.lastSorted ?? "").localeCompare(a.t.lastSorted ?? ""))
    .slice(0, 30);
  const heldOptions = all.filter((r) => r.result === "on_hold").map((r) => ({ id: r.id, label: `${batchLabel(r)} · ${r.orders?.companies?.name ?? ""}` }));
  const SORT_COLS = "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_150px_150px_70px_100px_90px] items-center gap-2.5";
  const REPORT_COLS = "grid grid-cols-[100px_minmax(0,1.6fr)_90px_90px_90px_70px_minmax(0,1fr)_60px] items-center gap-2.5";

  const rows = all.filter((r) => (f === "held" ? r.result === "on_hold" : f === "unpublished" ? !r.published : true));
  const COLS = "grid grid-cols-[100px_minmax(0,1fr)_100px_90px_90px_80px_130px_150px] items-center gap-2.5";

  return (
    <>
      <OpsHeader
        title="Quality control"
        actions={
          canEdit && (
            <Link href="/ops/quality/new" className="btn btn-primary">
              + Log inspection
            </Link>
          )
        }
      />
      {saved && <p className="m-0 bg-neutral-200 px-4 py-2.5 text-[13px] sm:px-8">Batch {saved} saved.</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] border-b-2 border-divider xl:grid-cols-2">
        <div className="border-divider px-4 py-6 sm:px-8 xl:border-r-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0">Defects by type · last 7 days</h4>
            <CustomerSees>Each customer sees only their own published batches</CustomerSees>
          </div>
          <div className="mb-4 mt-1 text-[12px] opacity-60">
            All customers: {rejected.toLocaleString("en-US")} rejects of {formatQty(sampled)} sampled
            {sampled ? ` (${((100 * rejected) / sampled).toFixed(2)}%)` : ""}.
          </div>
          <div className="flex flex-col gap-2.5 text-[13px]">
            {defects.length === 0 && <p className="m-0 opacity-60">No defects recorded this week.</p>}
            {defects.map(([code, n], i) => (
              <div key={code} className="grid grid-cols-[170px_minmax(0,1fr)_48px] items-center gap-3" title={`${label.get(code) ?? code}: ${n}`}>
                <span>{label.get(code) ?? code}</span>
                <div className="h-[18px]">
                  <div className={`h-full ${i === 0 ? "bg-accent" : "bg-text"}`} style={{ width: `${(n / topDefect) * 100}%` }} />
                </div>
                <b className="text-right">{n.toLocaleString("en-US")}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 py-6 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0">Shell height · last {heights.length} batches</h4>
            <InternalOnly />
          </div>
          <div className="mb-4 mt-1 text-[12px] opacity-60">spec {CROWN_HEIGHT.spec} mm · oldest on the left</div>
          <SpecChart
            points={heights}
            min={CROWN_HEIGHT.min!}
            max={CROWN_HEIGHT.max!}
            target={6}
            unit="mm"
            title="Shell height per batch against the CoA limits"
          />
          {trend && (
            <div className="mt-2.5 text-[12px] font-extrabold text-accent-700">
              ⚠ Trend: the last 7 batches keep rising. Check the tooling before it goes past the upper limit.
            </div>
          )}
        </div>
      </div>

      <div className="border-b-2 border-divider px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="m-0">Sorting · batches on hold</h4>
            <InternalOnly>Internal only · customers see on hold, then released</InternalOnly>
          </div>
          {canEdit && <SortingDialog batches={heldOptions} today={today} />}
        </div>
        <div className="mb-3 text-[12px] opacity-60">
          From the daily &ldquo;on hold products for sorting&rdquo; report: Quantity = cartons passed, Waste = cartons scrapped, sorted = passed + waste.
          1 carton = 10,000 crowns.
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1060px]">
            <div className={`${SORT_COLS} th-row border-b-2 border-divider py-2`}>
              <span>Batch</span>
              <span>Customer</span>
              <span>Sorted</span>
              <span>Passed</span>
              <span>Waste</span>
              <span>Waste %</span>
              <span>Last report</span>
              <span>Status</span>
            </div>
            {sortBatches.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No batches on hold.</p>}
            {sortBatches.map(({ r, t }) => {
              const pill = r.result ? RESULT_PILL[r.result] : RESULT_PILL.none;
              return (
                <div key={r.id} className={`${SORT_COLS} border-b border-divider py-2.5 text-[13px]`}>
                  <Link href={`/ops/quality/${r.id}#sorting`} className="truncate font-extrabold">
                    {batchLabel(r)}
                  </Link>
                  <span className="truncate">{r.orders?.companies?.name ?? "—"}</span>
                  <span>{t.reports ? cartonsLine(t.sorted) : <span className="opacity-60">Not sorted yet</span>}</span>
                  <span>{t.reports ? cartonsLine(t.passed) : "—"}</span>
                  <span className={t.waste ? "font-extrabold text-accent-700" : undefined}>{t.reports ? cartonsLine(t.waste) : "—"}</span>
                  <span className={t.waste ? "font-extrabold text-accent-700" : undefined}>{t.wastePct == null ? "—" : `${t.wastePct.toFixed(1)}%`}</span>
                  <span>{t.lastSorted ? formatDate(t.lastSorted) : "—"}</span>
                  <span>
                    <Pill style={pill.style}>{pill.label}</Pill>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {sortings.length > 0 && (
          <>
            <h5 className="mb-2 mt-6">Recent sorting reports</h5>
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className={`${REPORT_COLS} th-row border-b-2 border-divider py-2`}>
                  <span>Date</span>
                  <span>Batch</span>
                  <span>Sorted</span>
                  <span>Passed</span>
                  <span>Waste</span>
                  <span>Waste %</span>
                  <span>Reported by</span>
                  <span />
                </div>
                {sortings.slice(0, 15).map((x) => {
                  const b = byId.get(x.inspection_id);
                  return (
                    <div key={x.id} className={`${REPORT_COLS} border-b border-divider py-2 text-[13px]`} title={x.notes ?? undefined}>
                      <span>{formatDate(x.sorted_on)}</span>
                      <span className="truncate">{b ? batchLabel(b) : "—"}</span>
                      <span>{x.passed_cartons + x.waste_cartons}</span>
                      <span>{x.passed_cartons}</span>
                      <span className={x.waste_cartons ? "font-extrabold text-accent-700" : undefined}>{x.waste_cartons}</span>
                      <span>{formatWastePct(x.passed_cartons, x.waste_cartons)}</span>
                      <span className="truncate">{x.reported_by ?? "—"}</span>
                      {canEdit ? <DeleteSortingButton id={x.id} /> : <span />}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <h4 className="m-0">Batch inspections</h4>
          <div className="seg">
            {Object.entries(FILTERS).map(([k, v]) => (
              <Link
                key={k}
                href={k === "all" ? "/ops/quality" : `/ops/quality?f=${k}`}
                className={`seg-opt no-underline ${f === k ? "!bg-accent !text-bg" : "text-text"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[940px]">
            <div className={`${COLS} th-row border-b-2 border-divider py-2`}>
              <span>Batch</span>
              <span>Customer · brand</span>
              <span>Order</span>
              <span>Height</span>
              <span>Leak</span>
              <span>Reject</span>
              <span>Result</span>
              <span>Published</span>
            </div>
            {rows.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No inspections here.</p>}
            {rows.map((r) => {
              const held = r.result === "on_hold";
              const pill = r.result ? RESULT_PILL[r.result] : RESULT_PILL.none;
              const pct = Number(r.reject_pct);
              return (
                <div key={r.id} className={`${COLS} border-b border-divider py-2.5 text-[13px] ${held ? "bg-accent-100" : ""}`}>
                  <Link href={`/ops/quality/${r.id}`} className="font-extrabold">
                    {r.batch_no}
                  </Link>
                  <span className="truncate">
                    {r.orders?.companies?.name ?? "—"} · {r.orders?.brands?.name ?? "—"}
                  </span>
                  <Link href={`/ops/orders/${r.order_id}`} className="text-text">
                    {r.orders?.order_no ?? "—"}
                  </Link>
                  <span>{measureValue(r.measurements, CROWN_HEIGHT.key)?.toFixed(2) ?? "—"}</span>
                  <span>{measureValue(r.measurements, LEAK_PRESSURE.key)?.toFixed(1) ?? "—"}</span>
                  <span className={pct > REJECT_LIMIT_PCT ? "font-extrabold text-accent-700" : undefined}>{pct.toFixed(2)}%</span>
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
                      {r.published ? "Published" : "Not published"}
                    </form>
                  ) : (
                    <span className="text-[12px]">{r.published ? "Published" : "Not published"}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mb-0 mt-3 text-[12px] opacity-60">
          Inspected {formatDate(today)} and earlier. Shell height in mm, leaking pressure in kg/cm²: internal only. Customers see the reject
          rate, defects by type and the result of published batches.
        </p>
      </div>
    </>
  );
}
