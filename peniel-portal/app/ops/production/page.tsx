import type { Metadata } from "next";
import Link from "next/link";
import CrownGauge from "@/components/ops/CrownGauge";
import { OpsTopBar } from "@/components/ops/OpsHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { formatSpoiledPct, printTotals, type PrintRun } from "@/lib/print-runs";
import { loadEntries, loadLines, loadProducibleOrders } from "@/lib/production";
import { addDays, lastDays, rejectPct, REJECT_LIMIT_PCT } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Production" };

type RunRow = Pick<PrintRun, "run_date" | "sheets_printed" | "sheets_spoiled" | "crowns_per_sheet"> & {
  created_at: string;
  orders: { order_no: string; brands: { name: string } | null } | null;
};
type HeldRow = { batch_no: string; inspected_at: string; orders: { order_no: string } | null };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" });

/**
 * Production home, v2 "control room" (design 2b), dark. Filled from what staff
 * record: daily entries (crowns and camera rejects per line and shift) and the
 * coat & print line's runs. Everything here is internal.
 */
export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const me = await requireStaff(opsRolesFor("production"));
  const { range: r } = await searchParams;
  const range = r === "week" ? "week" : "today";
  const today = addisDateISO(new Date());
  const from = range === "week" ? addDays(today, -6) : today;
  const supabase = await createClient();

  const [entries, lines, orders, { data: runData }, { data: heldData }] = await Promise.all([
    loadEntries(supabase, { from: addDays(today, -20), to: today }),
    loadLines(supabase),
    loadProducibleOrders(supabase),
    supabase
      .from("print_runs")
      .select("run_date, sheets_printed, sheets_spoiled, crowns_per_sheet, created_at, orders(order_no, brands(name))")
      .gte("run_date", addDays(today, -20))
      .order("created_at", { ascending: false })
      .returns<RunRow[]>(),
    supabase.from("qc_inspections").select("batch_no, inspected_at, orders(order_no)").eq("result", "on_hold").returns<HeldRow[]>(),
  ]);
  const runs = runData ?? [];
  const inRange = entries.filter((e) => e.entry_date >= from);
  const produced = inRange.reduce((s, e) => s + e.produced, 0);
  const rejects = inRange.reduce((s, e) => s + e.rejects, 0);
  const pct = rejectPct(rejects, produced);
  const unpublished = orders.reduce((s, o) => s + o.unpublished, 0);
  const canEnter = me.role === "admin" || me.role === "production";
  const days = range === "week" ? 7 : 1;

  // Output against the average of the 14 days before the period (no targets are recorded).
  const prior = lastDays(addDays(from, -1), 14).map((d) => entries.filter((e) => e.entry_date === d).reduce((s, e) => s + e.produced, 0));
  const worked = prior.filter((v) => v > 0);
  const avg = worked.length ? (worked.reduce((s, v) => s + v, 0) / worked.length) * days : 0;
  const ofAvg = avg ? Math.round((100 * produced) / avg) : null;

  const sheets = printTotals(runs.filter((x) => x.run_date >= from));
  const days12 = lastDays(today, 12);
  const lineCards = [
    ...lines.map((l) => {
      const mine = entries.filter((e) => e.line === l.name);
      const perDay = days12.map((d) => mine.filter((e) => e.entry_date === d).reduce((s, e) => s + e.produced, 0));
      const out = mine.filter((e) => e.entry_date >= from).reduce((s, e) => s + e.produced, 0);
      const best = Math.max(1, ...perDay) * days;
      const running = [...new Set(mine.filter((e) => e.entry_date >= from).map((e) => e.order_no))];
      return {
        key: l.id,
        name: l.name,
        status: out ? "Running" : "No entries",
        value: formatQty(out),
        unit: range === "week" ? "crowns · 7 days" : "crowns today",
        pct: (100 * out) / best,
        bars: perDay,
        note: running.length ? running.join(" · ") : range === "week" ? "Nothing logged this week" : "Nothing logged today",
        down: false,
      };
    }),
    (() => {
      const perDay = days12.map((d) => printTotals(runs.filter((x) => x.run_date === d)).printed);
      const best = Math.max(1, ...perDay) * days;
      const printing = [...new Set(runs.filter((x) => x.run_date >= from).map((x) => `${x.orders?.brands?.name ?? ""} ${x.orders?.order_no ?? ""}`.trim()))];
      return {
        key: "print",
        name: "Coat & Print",
        status: sheets.printed ? "Running" : "No runs",
        value: sheets.printed ? formatQty(sheets.printed) : "0",
        unit: range === "week" ? "sheets · 7 days" : "sheets today",
        pct: (100 * sheets.printed) / best,
        bars: perDay,
        note: printing.length ? `${printing.join(" · ")} · ${formatSpoiledPct(sheets.printed, sheets.spoiled)} spoiled` : "No print runs logged",
        down: false,
      };
    })(),
  ];

  const days9 = lastDays(today, 9);
  const daily = days9.map((d) => entries.filter((e) => e.entry_date === d).reduce((s, e) => s + e.produced, 0));
  const dayMax = Math.max(1, ...daily, avg / days);
  const events = [
    ...entries.slice(0, 12).map((e) => ({
      at: e.created_at,
      hot: false,
      text: `${e.line.split(" · ")[0]} · ${formatQty(e.produced)} crowns · ${e.order_no} (shift ${e.shift})`,
    })),
    ...runs.slice(0, 6).map((x) => ({ at: x.created_at, hot: false, text: `Coat & print · ${x.sheets_printed.toLocaleString("en-US")} sheets · ${x.orders?.order_no ?? ""}` })),
    ...(heldData ?? []).map((h) => ({ at: h.inspected_at, hot: true, text: `QC hold on batch ${h.batch_no} · ${h.orders?.order_no ?? ""}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);
  const lastEntry = entries[0]?.created_at ?? null;

  return (
    <div className="min-h-screen bg-text text-bg">
      <OpsTopBar dark current="Control room">
        <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[.1em] text-accent">
          <span className="size-2 bg-accent" aria-hidden="true" />
          {lastEntry ? `LAST ENTRY ${formatDayMonth(lastEntry).toUpperCase()} ${timeFmt.format(new Date(lastEntry))}` : "NO ENTRIES YET"}
        </span>
        <Link href="/ops/production/sheets" className="btn border-2 border-neutral-600 !text-bg hover:bg-white/10">
          Printed sheets
        </Link>
        {canEnter && (
          <Link href="/production-entry" className="btn btn-primary">
            + Daily entry
          </Link>
        )}
      </OpsTopBar>

      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-7 sm:px-8">
        <h1 className="m-0 text-[40px] leading-[.95] tracking-[-.04em] text-bg sm:text-[64px]">Production · {range === "week" ? "7 days" : "today"}</h1>
        <div className="flex border border-neutral-700 text-[13px]">
          {(["today", "week"] as const).map((k) => (
            <Link
              key={k}
              href={k === "today" ? "/ops/production" : "/ops/production?range=week"}
              className={`px-3.5 py-2 no-underline ${range === k ? "bg-bg font-extrabold !text-text" : "!text-bg hover:bg-white/10"}`}
            >
              {k === "today" ? "Today" : "7 days"}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid border-y-2 border-neutral-800 sm:grid-cols-2 xl:grid-cols-[minmax(0,2.1fr)_repeat(3,minmax(0,1fr))]">
        <div className="px-4 py-6 sm:col-span-2 sm:px-8 xl:col-span-1">
          <h6 className="m-0 opacity-60">Output {range === "week" ? "· 7 days" : "today"} · all lines</h6>
          <div className="mt-2.5 text-[88px] font-extrabold leading-[.85] tracking-[-.06em] sm:text-[132px]">{formatQty(produced)}</div>
          <div className="relative mt-[18px] h-3 bg-neutral-800">
            <div className="absolute inset-y-0 left-0 bg-bg" style={{ width: `${Math.min(100, ofAvg ?? 0)}%` }} />
            <div className="absolute -bottom-1.5 -top-1.5 w-[3px] bg-accent" style={{ left: `${Math.min(99, ofAvg ?? 0)}%` }} />
          </div>
          <div className="mt-2 flex justify-between gap-3 text-[13px] opacity-75">
            <span>{ofAvg == null ? "No earlier output to compare" : `${ofAvg}% of the usual ${range === "week" ? "week" : "day"}`}</span>
            <span>{avg ? `usual ${formatQty(avg)} · ${inRange.length} entries` : `${inRange.length} entries`}</span>
          </div>
        </div>
        <div className="border-neutral-800 px-6 py-6 max-xl:border-t-2 xl:border-l-2">
          <h6 className="m-0 opacity-60">Camera reject rate</h6>
          <div className={`mt-2.5 text-[64px] font-extrabold leading-[.9] tracking-[-.05em] sm:text-[72px] ${pct > REJECT_LIMIT_PCT ? "text-accent" : ""}`}>
            {produced ? pct.toFixed(2) : "-"}
          </div>
          <div className="mt-2 text-[13px] opacity-75">% · limit {REJECT_LIMIT_PCT.toFixed(2)} · sorted by hand</div>
        </div>
        <div className="border-l-2 border-neutral-800 px-6 py-6 max-xl:border-t-2">
          <h6 className="m-0 opacity-60">Sheets printed</h6>
          <div className="mt-2.5 text-[64px] font-extrabold leading-[.9] tracking-[-.05em] sm:text-[72px]">{sheets.printed ? formatQty(sheets.printed) : "0"}</div>
          <div className="mt-2 text-[13px] opacity-75">{formatSpoiledPct(sheets.printed, sheets.spoiled)} spoiled · {sheets.crowns ? formatQty(sheets.crowns) : "0"} crowns</div>
        </div>
        <Link
          href="#orders"
          className={`px-6 py-6 no-underline max-xl:border-t-2 max-xl:border-neutral-800 sm:col-span-2 xl:col-span-1 ${unpublished ? "bg-accent !text-bg" : "border-l-2 border-neutral-800 !text-bg"}`}
        >
          <h6 className={unpublished ? "m-0" : "m-0 opacity-60"}>Not yet published</h6>
          <div className="mt-2.5 text-[64px] font-extrabold leading-[.9] tracking-[-.05em] sm:text-[72px]">{unpublished}</div>
          <div className="mt-2 text-[13px]">{unpublished ? "entries customers can't see yet →" : "customers are up to date"}</div>
        </Link>
      </div>

      <div className="grid border-b-2 border-neutral-800 sm:grid-cols-2 xl:grid-cols-4">
        {lineCards.map((l, i) => {
          const barMax = Math.max(1, ...l.bars);
          return (
            <div
              key={l.key}
              className={`flex flex-col items-center gap-4 px-6 py-[22px] ${i ? "border-neutral-800 max-sm:border-t-2 sm:border-l-2" : ""} ${l.down ? "bg-accent" : ""}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <b className="text-[15px]">{l.name}</b>
                <span className={`px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[.1em] text-bg ${l.down ? "bg-text" : "bg-neutral-800"}`}>{l.status}</span>
              </div>
              <CrownGauge pct={l.pct} value={l.value} unit={l.unit} down={l.down} />
              <div className="flex h-9 w-full items-end gap-[3px]" role="img" aria-label={`${l.name}: output per day, last 12 days`}>
                {l.bars.map((v, j) => (
                  <div
                    key={j}
                    className={v ? (l.down ? "bg-accent-800" : "bg-neutral-600") : l.down ? "bg-text" : "bg-accent"}
                    style={{ flex: 1, height: `${v ? Math.max(8, (100 * v) / barMax) : 6}%` }}
                  />
                ))}
              </div>
              <span className={`self-stretch text-[12px] ${l.down ? "font-extrabold" : "opacity-70"}`}>{l.note}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="border-neutral-800 px-4 pb-8 pt-6 sm:px-8 xl:border-r-2">
          <div className="mb-3.5 flex flex-wrap justify-between gap-2">
            <h3 className="m-0 text-bg">Output per day</h3>
            <span className="text-[12px] opacity-60">■ crowns · ┅ usual day {formatQty(avg / days)}</span>
          </div>
          <div className="relative flex h-[200px] items-end gap-1.5 border-b-2 border-bg sm:gap-2.5">
            {avg > 0 && <div className="absolute inset-x-0 border-t-2 border-dashed border-accent" style={{ bottom: `${(100 * avg) / days / dayMax}%` }} />}
            {daily.map((v, i) => (
              <div
                key={days9[i]}
                title={`${formatDate(days9[i])}: ${formatQty(v)}`}
                className={i === daily.length - 1 ? "bg-neutral-700" : avg && v < (0.7 * avg) / days ? "bg-accent" : "bg-bg"}
                style={{ flex: 1, height: `${Math.max(1, (100 * v) / dayMax)}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5 font-mono text-[10px] opacity-55 sm:gap-2.5 sm:text-[11px]">
            {days9.map((d) => (
              <span key={d} className="min-w-0 flex-1 truncate">
                {formatDayMonth(d)}
              </span>
            ))}
          </div>
        </div>
        <div className="px-4 pb-8 pt-6 sm:px-8 xl:pl-6">
          <h3 className="mb-3 mt-0 text-bg">Events</h3>
          {events.length === 0 && <p className="m-0 text-[13px] opacity-60">Nothing logged yet.</p>}
          {events.map((e, i) => (
            <div key={i} className="grid grid-cols-[112px_1fr] gap-2 border-t border-neutral-800 py-2.5 text-[13px]">
              <b className={`font-mono ${e.hot ? "text-accent" : ""}`}>
                {formatDayMonth(e.at)} {timeFmt.format(new Date(e.at))}
              </b>
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div id="orders" className="scroll-mt-4 bg-bg px-4 pb-8 pt-6 text-text sm:px-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[30px]">Orders in production</h2>
          <span className="text-[12px] opacity-60">Open an order to see its records and publish to the customer</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="th-row grid grid-cols-[100px_minmax(0,1.4fr)_150px_minmax(0,1fr)_90px_110px_110px] gap-3 border-b-2 border-text py-2">
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
                  <span className={o.unpublished ? "font-extrabold text-accent-700" : "opacity-60"}>{o.unpublished ? `${o.unpublished} to publish` : "-"}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <p className="mb-0 mt-3 text-[12px] opacity-60">
          Output is compared with the usual day (the average of the last 14 working days); no targets are recorded yet. OEE, downtime and line
          speeds need machine data the portal doesn&apos;t collect.
        </p>
      </div>
    </div>
  );
}
