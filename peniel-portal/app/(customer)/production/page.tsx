import type { Metadata } from "next";
import ProductionView, { type BatchRow, type BookingRow, type ProductionTab, type StockRow } from "@/components/customer/ProductionView";
import { brandSpec, type CustomerBrand } from "@/lib/customer-orders";
import { addisDateISO } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { addisLocalNow } from "@/lib/inventory";
import { addDays, lastDays, projectCompletion } from "@/lib/production-math";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Production" };

/** Orders past confirmation and not yet delivered or rejected. */
const ACTIVE: OrderStatus[] = ["confirmed", "awaiting_approval", "scheduled", "in_production", "quality_check", "on_hold", "ready_for_pickup", "dispatched"];

/**
 * Customer Production tab. Reads only customer_* views: published data for
 * this company, with no lines, shifts, measurements or locations
 * (CLAUDE.md rules 1–3).
 */
export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ tab?: string; result?: string }> }) {
  const sp = await searchParams;
  const tab: ProductionTab = sp.tab === "quality" || sp.tab === "stock" ? sp.tab : "output";
  const filter = sp.result === "released" || sp.result === "on_hold" ? sp.result : "all";
  const today = addisDateISO(new Date());
  const supabase = await createClient();

  const [{ data: orders }, { data: brands }, { data: daily }, { data: batches }, { data: stock }, { data: bookings }] = await Promise.all([
    supabase
      .from("customer_orders")
      .select("id, order_no, brand_id, brand_name, quantity, completed_qty, status, due_date")
      .in("status", ACTIVE)
      .order("created_at", { ascending: false })
      .returns<{ id: string; order_no: string; brand_id: string; brand_name: string; quantity: number; completed_qty: number; status: OrderStatus; due_date: string | null }[]>(),
    supabase.from("customer_brands").select("id, size, finish, liner").returns<CustomerBrand[]>(),
    supabase
      .from("customer_daily_output")
      .select("order_id, entry_date, produced_qty, reject_qty, published_at")
      .gte("entry_date", addDays(today, -60))
      .returns<{ order_id: string; entry_date: string; produced_qty: number; reject_qty: number; published_at: string | null }[]>(),
    supabase
      .from("customer_quality_batches")
      .select("id, batch_no, order_id, order_no, inspected_at, sample_size, reject_pct, result, customer_reason, published_at")
      .order("inspected_at", { ascending: false })
      .limit(200)
      .returns<(BatchRow & { sample_size: number; published_at: string | null })[]>(),
    supabase
      .from("customer_finished_stock")
      .select("id, brand_name, batch_no, quantity, ready_since, status, order_no, customer_reason, updated_at")
      .order("ready_since", { ascending: false })
      .returns<(StockRow & { updated_at: string })[]>(),
    supabase
      .from("customer_pickup_bookings")
      .select("id, requested_at, proposed_time, status, delivery_note_no, batch_nos, created_at")
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<{ id: string; requested_at: string; proposed_time: string | null; status: BookingRow["status"]; delivery_note_no: string | null; batch_nos: string[] }[]>(),
  ]);

  const spec = new Map((brands ?? []).map((b) => [b.id, [brandSpec(b), b.liner].filter(Boolean).join(" · ")]));
  const days = lastDays(today, 14);
  const output = (orders ?? []).map((o) => {
    const mine = (daily ?? []).filter((d) => d.order_id === o.id);
    const good = (date: string) =>
      mine.filter((d) => d.entry_date === date).reduce((s, d) => s + Number(d.produced_qty) - Number(d.reject_qty), 0);
    const perDay = mine.map((d) => ({ date: d.entry_date, good: Number(d.produced_qty) - Number(d.reject_qty) }));
    const projection = projectCompletion(perDay, Number(o.quantity) - Number(o.completed_qty), today);
    return {
      id: o.id,
      order_no: o.order_no,
      product: [o.brand_name, spec.get(o.brand_id)].filter(Boolean).join(" · "),
      status: o.status,
      quantity: Number(o.quantity),
      completed: Number(o.completed_qty),
      today: good(today),
      projection: projection?.date ?? null,
      perDay: projection?.perDay ?? null,
      due_date: o.due_date,
      daily: days.map((date) => ({ date, good: good(date) })),
    };
  });

  // Defects of the batches inspected in the last 30 days.
  const recentBatches = (batches ?? []).filter((b) => b.inspected_at.slice(0, 10) >= addDays(today, -30));
  const { data: defects } = recentBatches.length
    ? await supabase
        .from("customer_defects_by_type")
        .select("inspection_id, customer_label, count")
        .in("inspection_id", recentBatches.map((b) => b.id))
        .returns<{ inspection_id: string; customer_label: string; count: number }[]>()
    : { data: [] };
  const byLabel = new Map<string, number>();
  for (const d of defects ?? []) byLabel.set(d.customer_label, (byLabel.get(d.customer_label) ?? 0) + d.count);

  const stamps: Record<ProductionTab, (string | null)[]> = {
    output: (daily ?? []).map((d) => d.published_at),
    quality: (batches ?? []).map((b) => b.published_at),
    stock: (stock ?? []).map((s) => s.updated_at),
  };
  const lastUpdated = stamps[tab].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;

  return (
    <ProductionView
      d={{
        tab,
        lastUpdated,
        output,
        quality: {
          batches: batches ?? [],
          filter,
          defects: [...byLabel.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
          sampled: recentBatches.reduce((s, b) => s + Number(b.sample_size), 0),
        },
        stock: (stock ?? []).map((s) => ({ ...s, quantity: Number(s.quantity) })),
        bookings: (bookings ?? []).map((b) => ({
          id: b.id,
          requested_at: b.requested_at,
          proposed_time: b.proposed_time,
          status: b.status,
          delivery_note_no: b.delivery_note_no,
          batches: b.batch_nos,
        })),
        pickupMin: addisLocalNow(),
      }}
    />
  );
}
