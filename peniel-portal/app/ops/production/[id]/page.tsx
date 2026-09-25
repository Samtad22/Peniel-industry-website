import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEntry, publishOrder, setEntryPublished } from "@/app/ops/production/actions";
import OpsHeader from "@/components/ops/OpsHeader";
import Bars from "@/components/ui/Bars";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDateTime, formatDayMonth, formatQty } from "@/lib/format";
import { dailyGood, loadEntries } from "@/lib/production";
import { projectCompletion, rejectPct } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { shortLine } from "@/lib/staff-orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Production by order" };

type Order = {
  id: string;
  order_no: string;
  quantity: number;
  status: string;
  confirmed_due_date: string | null;
  revised_due_date: string | null;
  companies: { name: string } | null;
  brands: { name: string } | null;
};

/** One order's production, and what its customer sees (design 1h). */
export default async function OrderProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff(opsRolesFor("production"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const today = addisDateISO(new Date());

  const [{ data: o }, entries] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, quantity, status, confirmed_due_date, revised_due_date, companies(name), brands(name)")
      .eq("id", id)
      .maybeSingle<Order>(),
    loadEntries(supabase, { orderId: id }),
  ]);
  if (!o) notFound();

  const canPublish = me.role === "admin" || me.role === "production";
  const quantity = Number(o.quantity);
  const good = entries.reduce((s, e) => s + e.produced - e.rejects, 0);
  const publishedGood = entries.filter((e) => e.published).reduce((s, e) => s + e.produced - e.rejects, 0);
  const produced = entries.reduce((s, e) => s + e.produced, 0);
  const rejects = entries.reduce((s, e) => s + e.rejects, 0);
  const pending = entries.filter((e) => !e.published);
  const lastPub = entries
    .filter((e) => e.published_at)
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
  const daily = dailyGood(entries, today, 14);
  const due = o.revised_due_date ?? o.confirmed_due_date;
  const projection = projectCompletion(daily, quantity - good, today);
  const lines = [...new Set(entries.map((e) => shortLine(e.line)))].sort();
  const pct = quantity ? Math.min(100, Math.round((good / quantity) * 100)) : 0;
  const kpi = "border-b-2 border-l-2 border-divider px-4 py-5 sm:px-8";

  return (
    <>
      <OpsHeader
        crumb={{ label: "Production", href: "/ops/production", current: "by order" }}
        title={`${o.order_no} · ${o.companies?.name ?? "-"} · ${o.brands?.name ?? "-"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/ops/orders/${o.id}/preview`} target="_blank" className="btn btn-secondary text-text">
              Preview as customer ↗
            </Link>
            <Link href={`/ops/orders/${o.id}`} className="btn btn-secondary text-text">
              Order page →
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-divider bg-accent-100 px-4 py-3.5 sm:px-8">
        <b>{pending.length ? `${pending.length} ${pending.length === 1 ? "entry" : "entries"} not yet published` : "Customer is up to date"}</b>
        <span className="text-[13px]">
          {lastPub
            ? `Last published ${formatDateTime(lastPub.published_at)}${lastPub.published_by ? ` by ${lastPub.published_by}` : ""}`
            : "Nothing published yet"}
        </span>
        {canPublish && pending.length > 0 && (
          <form action={publishOrder} className="ml-auto">
            <input type="hidden" name="order_id" value={o.id} />
            <button type="submit" className="btn btn-primary">
              Publish now ↑
            </button>
          </form>
        )}
      </div>

      <div className="overflow-hidden">
        <div className="-ml-0.5 grid grid-cols-2 xl:grid-cols-4">
          <div className={kpi}>
            <h6 className="m-0 flex items-center gap-1.5 opacity-60">Completed / ordered</h6>
            <div className="text-[40px] font-extrabold leading-[1.1]">
              {formatQty(good)} <span className="text-[18px] opacity-60">/ {formatQty(quantity)}</span>
            </div>
            <div className="mt-2 h-1.5 bg-surface">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-[12px]">Customer sees {formatQty(publishedGood)} (published)</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Projected completion</h6>
            <div className="text-[40px] font-extrabold leading-[1.1]">{projection ? formatDayMonth(projection.date) : "-"}</div>
            <div className="text-[12px]">
              {projection ? `at ${formatQty(projection.perDay)}/day` : "no recent output"}
              {due && ` · due ${formatDayMonth(due)}`}
            </div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 opacity-60">Reject rate</h6>
            <div className="text-[40px] font-extrabold leading-[1.1]">{produced ? `${rejectPct(rejects, produced).toFixed(2)}%` : "-"}</div>
            <div className="text-[12px]">per-batch rates are published by QC</div>
          </div>
          <div className={kpi}>
            <h6 className="m-0 flex items-center gap-2 opacity-60">
              Lines used <InternalOnly />
            </h6>
            <div className="text-[40px] font-extrabold leading-[1.1]">{lines.join(" · ") || "-"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_560px]">
        <div className="border-divider px-4 py-6 sm:px-8 xl:border-r-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="m-0">Daily output · last 14 days</h4>
            <CustomerSees>Customer sees published days</CustomerSees>
          </div>
          <Bars
            bars={daily.map((d, i) => ({
              label: `${formatDayMonth(d.date)} · ${formatQty(d.good)}${d.unpublished ? " (not all published)" : ""}`,
              value: d.good,
              hot: i === daily.length - 1,
              muted: d.unpublished,
            }))}
            title={`Good output per day for ${o.order_no}, last 14 days`}
            start={formatDayMonth(daily[0].date)}
            end={formatDayMonth(daily.at(-1)!.date)}
          />
          <p className="mb-0 mt-2 text-[12px] opacity-60">Grey bars include entries not yet published.</p>
        </div>

        <div className="px-4 py-6 sm:px-8 xl:pl-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="m-0">Production records</h4>
            <InternalOnly />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <div className="th-row grid grid-cols-[80px_44px_44px_minmax(0,1fr)_70px_120px] gap-2 border-b-2 border-divider py-1.5">
                <span>Date</span>
                <span>Shift</span>
                <span>Line</span>
                <span className="text-right">Produced</span>
                <span className="text-right">Rejects</span>
                <span>Published</span>
              </div>
              {entries.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No entries yet.</p>}
              {entries.map((e) => (
                <div key={e.id} className="grid grid-cols-[80px_44px_44px_minmax(0,1fr)_70px_120px] items-center gap-2 border-b border-divider py-2 text-[13px]">
                  <span>{formatDayMonth(e.entry_date)}</span>
                  <span>{e.shift}</span>
                  <span>{shortLine(e.line)}</span>
                  <b className="text-right tabular-nums">{e.produced.toLocaleString("en-US")}</b>
                  <span className="text-right tabular-nums">{e.rejects.toLocaleString("en-US")}</span>
                  <span className="flex items-center gap-2 text-[12px]">
                    {canPublish ? (
                      <form action={setEntryPublished}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="published" value={String(!e.published)} />
                        <button
                          type="submit"
                          className={`cursor-pointer border-0 bg-transparent p-0 text-[12px] font-extrabold ${e.published ? "text-neutral-700" : "text-accent-700"}`}
                          title={e.published ? "Unpublish (hide from the customer)" : "Publish to the customer"}
                        >
                          {e.published ? `✓ ${formatDate(e.published_at)}` : "Publish"}
                        </button>
                      </form>
                    ) : (
                      <span className={e.published ? "opacity-70" : "font-extrabold text-accent-700"}>{e.published ? "✓" : "Pending"}</span>
                    )}
                    {canPublish && !e.published && (
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline" title="Delete this entry">
                          Delete
                        </button>
                      </form>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mb-0 mt-2 text-[12px] opacity-60">
            Published entries are frozen. Unpublish one to correct or delete it.
          </p>
        </div>
      </div>
    </>
  );
}
