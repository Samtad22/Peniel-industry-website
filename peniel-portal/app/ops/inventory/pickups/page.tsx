import type { Metadata } from "next";
import Link from "next/link";
import { approvePickup } from "@/app/ops/inventory/actions";
import OpsHeader from "@/components/ops/OpsHeader";
import { CollectionForm, ProposeTimeForm } from "@/components/ops/InventoryForms";
import { Pill } from "@/components/ui/StatusBadge";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatDateTime, formatQty } from "@/lib/format";
import { addisLocalNow, PICKUP_PILL, type PickupStatus } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pickups" };

type Booking = {
  id: string;
  requested_at: string;
  proposed_time: string | null;
  customer_note: string | null;
  status: PickupStatus;
  vehicle: string | null;
  driver: string | null;
  delivery_note_no: string | null;
  updated_at: string;
  companies: { name: string } | null;
  pickup_booking_items: {
    finished_stock: {
      batch_no: string;
      quantity: number;
      location: string | null;
      brands: { name: string } | null;
      orders: { order_no: string } | null;
    } | null;
  }[];
};

/** Pickup bookings and recording a collection (design 1l). */
export default async function PickupsPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const me = await requireStaff(["admin", "warehouse", "sales", "production"]);
  const { b } = await searchParams;
  const canAct = ["admin", "warehouse", "sales"].includes(me.role);
  const supabase = await createClient();

  const { data } = await supabase
    .from("pickup_bookings")
    .select(
      "id, requested_at, proposed_time, customer_note, status, vehicle, driver, delivery_note_no, updated_at, companies(name), pickup_booking_items(finished_stock(batch_no, quantity, location, brands(name), orders(order_no)))",
    )
    .order("requested_at")
    .limit(200)
    .returns<Booking[]>();
  const all = data ?? [];
  const open = all.filter((x) => x.status !== "collected");
  const done = all.filter((x) => x.status === "collected").sort((x, y) => y.updated_at.localeCompare(x.updated_at)).slice(0, 10);
  const selected = open.find((x) => x.id === b) ?? open.find((x) => x.status === "confirmed") ?? open[0] ?? null;
  const nowLocal = addisLocalNow();

  const items = (x: Booking) => x.pickup_booking_items.map((i) => i.finished_stock).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const total = (x: Booking) => items(x).reduce((s, i) => s + Number(i.quantity), 0);

  return (
    <>
      <OpsHeader
        crumb={{ label: "Inventory", href: "/ops/inventory", current: "Pickups" }}
        title="Pickup bookings"
      />
      <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 border-divider px-4 py-5 sm:px-8 xl:border-r-2">
          {open.length === 0 && <p className="m-0 py-3 text-[14px] opacity-70">No open pickup bookings.</p>}
          {open.map((x) => {
            const on = x.id === selected?.id;
            return (
              <div key={x.id} className={`flex flex-col gap-2 border-b border-divider px-3 py-4 text-[14px] ${on ? "bg-neutral-200 shadow-[inset_4px_0_0_var(--color-accent)]" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/ops/inventory/pickups?b=${x.id}`} className="text-[16px] font-extrabold text-text no-underline hover:underline">
                    {x.companies?.name ?? "—"}
                  </Link>
                  <Pill style={PICKUP_PILL[x.status].style}>{PICKUP_PILL[x.status].label}</Pill>
                </div>
                <span className="text-[13px]">
                  {items(x)
                    .map((i) => `${i.orders?.order_no ?? "—"} · ${i.brands?.name ?? ""} · ${formatQty(Number(i.quantity))}`)
                    .join("  ·  ")}
                </span>
                <span className="text-[13px]">
                  Requested: <b>{formatDateTime(x.requested_at)}</b>
                  {x.proposed_time && x.proposed_time !== x.requested_at && (
                    <>
                      {" "}
                      · {x.status === "confirmed" ? "Confirmed for" : "Proposed"}: <b>{formatDateTime(x.proposed_time)}</b>
                    </>
                  )}
                </span>
                {x.customer_note && <span className="text-[13px] opacity-75">“{x.customer_note}”</span>}
                {canAct && x.status !== "confirmed" && (
                  <div className="flex flex-wrap items-end gap-3 pt-1">
                    <form action={approvePickup}>
                      <input type="hidden" name="id" value={x.id} />
                      <button type="submit" className="btn btn-primary btn-split min-h-11 w-[160px]">
                        Approve<span aria-hidden="true">✓</span>
                      </button>
                    </form>
                    <ProposeTimeForm id={x.id} min={nowLocal} />
                  </div>
                )}
              </div>
            );
          })}

          {done.length > 0 && (
            <>
              <h5 className="mb-1 mt-6">Recently collected</h5>
              {done.map((x) => (
                <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-divider py-2 text-[13px]">
                  <span>
                    <b>{x.companies?.name}</b> · {formatQty(total(x))} · DN {x.delivery_note_no}
                  </span>
                  <span className="opacity-70">{formatDate(x.updated_at)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="bg-surface px-4 py-6 sm:px-8 xl:pl-6">
          {selected && canAct ? (
            <div className="flex flex-col gap-4">
              <div>
                <h6 className="m-0">Record collection</h6>
                <h3 className="mb-0 mt-1">{selected.companies?.name}</h3>
                <div className="text-[13px] opacity-75">
                  {PICKUP_PILL[selected.status].label} · {formatDateTime(selected.proposed_time ?? selected.requested_at)} · {formatQty(total(selected))} crowns
                </div>
              </div>
              <div className="flex flex-col text-[13px]">
                <div className="mb-1 text-[11px] uppercase tracking-[0.08em] opacity-60">Batches to load</div>
                {items(selected).map((i) => (
                  <div key={i.batch_no} className="flex justify-between gap-2 border-b border-divider py-1.5">
                    <span>
                      <b>{i.batch_no}</b> · {i.brands?.name} · {i.orders?.order_no ?? "—"}
                    </span>
                    <span>
                      {Number(i.quantity).toLocaleString("en-US")}
                      {i.location && <span className="opacity-60"> · {i.location}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <CollectionForm id={selected.id} suggestedNote={`DN-${items(selected)[0]?.orders?.order_no?.slice(3) ?? ""}`} />
            </div>
          ) : (
            <p className="m-0 text-[14px] opacity-70">{selected ? "Only Warehouse, Sales and Admin record collections." : "Choose a booking."}</p>
          )}
        </div>
      </div>
    </>
  );
}
