import type { Metadata } from "next";
import OrdersHomeView, { type CustomerOrderRow } from "@/components/customer/OrdersHomeView";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders" };

type Row = {
  id: string;
  order_no: string;
  po_number: string;
  brand_id: string;
  brand_name: string;
  quantity: number;
  due_date: string | null;
  requested_date: string | null;
  status: OrderStatus;
  customer_reason: string | null;
};

type Brand = { id: string; size: string; finish: string | null; liner: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : null;
  const supabase = await createClient();
  const yearStart = `${new Date().getFullYear()}-01-01`;

  // Every query goes through the customer_* views: already limited to this
  // user's company, with no internal columns (CLAUDE.md rules 1–2).
  const [{ data: orders, error }, { data: brands }, { data: delivered }] = await Promise.all([
    supabase
      .from("customer_orders")
      .select("id, order_no, po_number, brand_id, brand_name, quantity, due_date, requested_date, status, customer_reason")
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("customer_brands").select("id, size, finish, liner").returns<Brand[]>(),
    supabase
      .from("customer_order_timeline")
      .select("order_id")
      .eq("status", "delivered")
      .gte("created_at", yearStart)
      .returns<{ order_id: string }[]>(),
  ]);

  if (error) {
    return (
      <p className="m-10 bg-accent px-4 py-3 text-[14px] text-bg">We couldn&apos;t load your orders. Please refresh.</p>
    );
  }

  const spec = new Map((brands ?? []).map((b) => [b.id, [b.size, b.finish, b.liner].filter(Boolean).join(" · ")]));
  const rows: CustomerOrderRow[] = (orders ?? []).map((o) => ({
    id: o.id,
    order_no: o.order_no,
    po_number: o.po_number,
    product: [o.brand_name, spec.get(o.brand_id)].filter(Boolean).join(" · "),
    quantity: Number(o.quantity),
    due_date: o.due_date ?? o.requested_date,
    status: o.status,
    customer_reason: o.customer_reason,
  }));

  const deliveredIds = new Set((delivered ?? []).map((d) => d.order_id));

  return (
    <OrdersHomeView
      d={{
        orders: rows,
        filter,
        kpis: {
          open: rows.filter((o) => OPEN_STATUSES.includes(o.status)).length,
          inProduction: rows.filter((o) => o.status === "in_production" || o.status === "quality_check").length,
          awaiting: rows.filter((o) => o.status === "awaiting_approval").length,
          deliveredYtd: rows.filter((o) => deliveredIds.has(o.id)).reduce((s, o) => s + o.quantity, 0),
        },
      }}
    />
  );
}
