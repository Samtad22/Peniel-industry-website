import type { Metadata } from "next";
import OrderDetail from "@/components/customer/OrderDetail";
import OrdersHomeView, { type CustomerOrderRow } from "@/components/customer/OrdersHomeView";
import { brandSpec, loadCustomerOrder, type CustomerBrand } from "@/lib/customer-orders";
import { OPEN_STATUSES, ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; o?: string; submitted?: string }>;
}) {
  const sp = await searchParams;
  const filter = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : null;
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
    supabase
      .from("customer_brands")
      .select("id, name, size, finish, liner, colours, active")
      .order("name")
      .returns<CustomerBrand[]>(),
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

  const spec = new Map((brands ?? []).map((b) => [b.id, [brandSpec(b), b.liner].filter(Boolean).join(" · ")]));
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
  const openRows = (orders ?? []).filter((o) => OPEN_STATUSES.includes(o.status));

  const selectedId = sp.o && rows.some((r) => r.id === sp.o) ? sp.o : null;
  const detail = selectedId ? await loadCustomerOrder(supabase, selectedId) : null;
  if (detail?.threadId && detail.messages.some((m) => m.from_peniel)) {
    await supabase.rpc("customer_mark_thread_read", { p_thread_id: detail.threadId });
  }
  const submitted = sp.submitted ? rows.find((r) => r.id === sp.submitted) : undefined;

  return (
    <OrdersHomeView
      d={{
        orders: rows,
        filter,
        q: (sp.q ?? "").slice(0, 60),
        selectedId,
        submitted: submitted ? { id: submitted.id, order_no: submitted.order_no } : null,
        brands: (brands ?? [])
          .filter((b) => b.active)
          .map((b) => ({
            id: b.id,
            name: b.name,
            spec: brandSpec(b),
            colours: b.colours,
            open: openRows.filter((o) => o.brand_id === b.id).length,
          })),
        kpis: {
          open: openRows.length,
          inProduction: rows.filter((o) => o.status === "in_production" || o.status === "quality_check").length,
          awaiting: rows.filter((o) => o.status === "awaiting_approval").length,
          deliveredYtd: rows.filter((o) => deliveredIds.has(o.id)).reduce((s, o) => s + o.quantity, 0),
        },
      }}
      detail={detail ? <OrderDetail o={detail} /> : undefined}
    />
  );
}
