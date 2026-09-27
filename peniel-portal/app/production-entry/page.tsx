import ConfirmForm from "@/components/ui/ConfirmForm";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { deleteEntry } from "@/app/ops/production/actions";
import EntryForm from "@/components/ops/EntryForm";
import SignOutButton from "@/components/SignOutButton";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatQty } from "@/lib/format";
import { loadEntries, loadLines, loadProducibleOrders } from "@/lib/production";
import { rejectPct } from "@/lib/production-math";
import { ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Production entry | Peniel Ops" };

/**
 * Daily production entry (design 1g). Full-screen, big targets, no sidebar:
 * it lives on a tablet on the production floor.
 */
export default async function ProductionEntryPage() {
  const me = await requireStaff(["admin", "production"]);
  const today = addisDateISO(new Date());
  const supabase = await createClient();
  const [lines, orders, entries] = await Promise.all([
    loadLines(supabase),
    loadProducibleOrders(supabase),
    loadEntries(supabase, { from: today, to: today }),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b-2 border-text bg-surface px-5 py-3">
        <Image src="/img/logo-icon.png" alt="" width={36} height={36} />
        <span className="flex-1 leading-[.92]">
          <b className="block text-[20px] tracking-[-.03em]">PENIEL</b>
          <b className="block text-[20px] tracking-[-.03em] text-accent">OPS</b>
        </span>
        <span className="text-[13px] max-sm:hidden">
          {me.full_name} · {ROLE_LABELS[me.role]}
        </span>
        <Link href="/ops/production" className="flex min-h-11 items-center text-[13px] font-extrabold text-text hover:text-text">
          Control room →
        </Link>
        <SignOutButton className="text-[13px] text-accent-700" />
      </header>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-divider p-4 sm:p-6 md:border-r-2">
          <span className="font-mono text-[11px] font-semibold tracking-[.1em]">OPS / 04 · PRODUCTION / DAILY ENTRY</span>
          <h1 className="mb-5 mt-2 text-[40px] leading-[.95] tracking-[-.04em] sm:text-[56px]">Daily entry</h1>
          {lines.length === 0 ? (
            <p className="m-0 text-[15px]">No production lines are set up. An admin needs to add them first.</p>
          ) : (
            <EntryForm
              today={today}
              lines={lines}
              orders={orders.map((o) => ({
                id: o.id,
                label: `${o.order_no} · ${o.company.split(" ")[0]} · ${o.brand} · ${formatQty(o.quantity)}`,
                quantity: o.quantity,
                good: o.good,
              }))}
            />
          )}
        </div>
        <aside className="bg-surface px-5 py-6">
          <h2 className="mb-0 mt-0 border-b-2 border-text pb-2 text-[26px]">Today&apos;s entries</h2>
          <div>
            {entries.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">Nothing entered today yet.</p>}
            {entries.map((e) => (
              <div key={e.id} className="flex min-h-12 flex-col gap-0.5 border-b border-divider py-2.5 text-[13px]">
                <span className="flex justify-between gap-2">
                  <b>{e.order_no}</b>
                  <b>{e.produced.toLocaleString("en-US")}</b>
                </span>
                <span className="flex justify-between gap-2 opacity-70">
                  <span>
                    Shift {e.shift} · {e.line} · {e.entered_by ?? "-"}
                  </span>
                  <span>rej {rejectPct(e.rejects, e.produced).toFixed(2)}%</span>
                </span>
                <span className="flex items-center justify-between gap-2 text-[12px]">
                  <span className={e.published ? "opacity-60" : "font-extrabold text-accent-700"}>
                    {e.published ? "Published" : "Not published"}
                  </span>
                  {!e.published && (
                    <ConfirmForm
                      action={deleteEntry}
                      fields={{ id: e.id }}
                      message={`Remove this entry (${e.order_no}, ${e.produced.toLocaleString("en-US")} crowns, shift ${e.shift})? Use this when it was entered by mistake.`}
                      label="Remove"
                      className="min-h-9 cursor-pointer border-0 bg-transparent text-[12px] underline"
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
