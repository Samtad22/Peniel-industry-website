import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatQty } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";

export const metadata: Metadata = { title: "Orders" };

type Row = {
  id: string;
  order_no: string;
  brand_name: string;
  po_number: string;
  quantity: number;
  completed_qty: number;
  due_date: string | null;
  requested_date: string | null;
  status: OrderStatus;
  customer_reason: string | null;
};

export default async function OrdersPage() {
  const supabase = await createClient();
  // customer_orders is already limited to this user's company, in the database.
  const { data, error } = await supabase
    .from("customer_orders")
    .select("id, order_no, brand_name, po_number, quantity, completed_qty, due_date, requested_date, status, customer_reason")
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  return (
    <>
      <PageHeader title="Orders" description="All orders for your company, newest first." />
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">We couldn&apos;t load your orders. Please refresh.</p>
      ) : !data?.length ? (
        <p className="rounded-xl border border-line bg-white p-8 text-sm text-muted">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-navy-tint/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">PO</th>
                <th className="px-4 py-3 text-right font-medium">Completed / ordered</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs text-ink">{o.order_no}</td>
                  <td className="px-4 py-3 font-medium text-ink">{o.brand_name}</td>
                  <td className="px-4 py-3 text-muted">{o.po_number}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQty(o.completed_qty)} / {formatQty(o.quantity)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(o.due_date ?? o.requested_date)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                    {o.status === "on_hold" && o.customer_reason && (
                      <p className="mt-1 max-w-xs text-xs text-muted">{o.customer_reason}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
