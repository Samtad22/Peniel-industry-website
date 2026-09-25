import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/order-status";
import { lastDays } from "@/lib/production-math";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Orders production can book output against. */
export const PRODUCIBLE: OrderStatus[] = ["confirmed", "scheduled", "in_production", "quality_check"];

export type EntryRow = {
  id: string;
  order_id: string;
  order_no: string;
  company: string;
  brand: string;
  entry_date: string;
  shift: string;
  line: string;
  produced: number;
  rejects: number;
  published: boolean;
  published_at: string | null;
  published_by: string | null;
  entered_by: string | null;
  created_at: string;
};

type RawEntry = {
  id: string;
  order_id: string;
  entry_date: string;
  shift: string;
  produced_qty: number;
  reject_qty: number;
  published: boolean;
  published_at: string | null;
  created_at: string;
  production_lines: { name: string } | null;
  orders: { order_no: string; companies: { name: string } | null; brands: { name: string } | null } | null;
  enterer: { full_name: string } | null;
  publisher: { full_name: string } | null;
};

const ENTRY_SELECT = `id, order_id, entry_date, shift, produced_qty, reject_qty, published, published_at, created_at,
  production_lines(name), orders(order_no, companies(name), brands(name)),
  enterer:profiles!production_entries_entered_by_fkey(full_name),
  publisher:profiles!production_entries_published_by_fkey(full_name)`;

const toEntry = (e: RawEntry): EntryRow => ({
  id: e.id,
  order_id: e.order_id,
  order_no: e.orders?.order_no ?? "-",
  company: e.orders?.companies?.name ?? "-",
  brand: e.orders?.brands?.name ?? "-",
  entry_date: e.entry_date,
  shift: e.shift,
  line: e.production_lines?.name ?? "-",
  produced: Number(e.produced_qty),
  rejects: Number(e.reject_qty),
  published: e.published,
  published_at: e.published_at,
  published_by: e.publisher?.full_name ?? null,
  entered_by: e.enterer?.full_name ?? null,
  created_at: e.created_at,
});

export async function loadEntries(
  supabase: Supabase,
  filter: { from?: string; to?: string; orderId?: string },
): Promise<EntryRow[]> {
  let q = supabase.from("production_entries").select(ENTRY_SELECT).order("entry_date", { ascending: false }).order("created_at", { ascending: false });
  if (filter.from) q = q.gte("entry_date", filter.from);
  if (filter.to) q = q.lte("entry_date", filter.to);
  if (filter.orderId) q = q.eq("order_id", filter.orderId);
  const { data } = await q.limit(2000).returns<RawEntry[]>();
  return (data ?? []).map(toEntry);
}

export type ProducibleOrder = {
  id: string;
  order_no: string;
  company: string;
  brand: string;
  quantity: number;
  status: OrderStatus;
  due_date: string | null;
  /** Good crowns so far (all entries, published or not). */
  good: number;
  unpublished: number;
  last_entry: string | null;
};

/** Orders that are (or are about to be) on the lines, with their totals so far. */
export async function loadProducibleOrders(supabase: Supabase): Promise<ProducibleOrder[]> {
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_no, quantity, status, confirmed_due_date, revised_due_date, companies(name), brands(name)")
    .in("status", PRODUCIBLE)
    .order("order_no")
    .returns<
      {
        id: string;
        order_no: string;
        quantity: number;
        status: OrderStatus;
        confirmed_due_date: string | null;
        revised_due_date: string | null;
        companies: { name: string } | null;
        brands: { name: string } | null;
      }[]
    >();
  const ids = (orders ?? []).map((o) => o.id);
  const { data: entries } = ids.length
    ? await supabase
        .from("production_entries")
        .select("order_id, produced_qty, reject_qty, published, entry_date")
        .in("order_id", ids)
        .returns<{ order_id: string; produced_qty: number; reject_qty: number; published: boolean; entry_date: string }[]>()
    : { data: [] };

  return (orders ?? []).map((o) => {
    const mine = (entries ?? []).filter((e) => e.order_id === o.id);
    return {
      id: o.id,
      order_no: o.order_no,
      company: o.companies?.name ?? "-",
      brand: o.brands?.name ?? "-",
      quantity: Number(o.quantity),
      status: o.status,
      due_date: o.revised_due_date ?? o.confirmed_due_date,
      good: mine.reduce((s, e) => s + Number(e.produced_qty) - Number(e.reject_qty), 0),
      unpublished: mine.filter((e) => !e.published).length,
      last_entry: mine.map((e) => e.entry_date).sort().at(-1) ?? null,
    };
  });
}

export async function loadLines(supabase: Supabase) {
  const { data } = await supabase
    .from("production_lines")
    .select("id, name")
    .eq("active", true)
    .order("name")
    .returns<{ id: string; name: string }[]>();
  return data ?? [];
}

/** Good output per day for the last `days` days, oldest first. */
export function dailyGood(entries: EntryRow[], today: string, days: number, onlyPublished = false) {
  return lastDays(today, days).map((date) => ({
    date,
    good: entries
      .filter((e) => e.entry_date === date && (!onlyPublished || e.published))
      .reduce((s, e) => s + e.produced - e.rejects, 0),
    unpublished: entries.some((e) => e.entry_date === date && !e.published),
  }));
}
