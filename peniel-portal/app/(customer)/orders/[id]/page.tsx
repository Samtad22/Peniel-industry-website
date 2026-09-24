import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OrderDetail from "@/components/customer/OrderDetail";
import StatusBadge from "@/components/ui/StatusBadge";
import { loadCustomerOrder } from "@/lib/customer-orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Order" };

/** One order on its own page (design 1s; also the link target on phones). */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const o = await loadCustomerOrder(supabase, id);
  if (!o) notFound();
  if (o.threadId && o.messages.some((m) => m.from_peniel)) {
    await supabase.rpc("customer_mark_thread_read", { p_thread_id: o.threadId });
  }

  return (
    <>
      <div className="flex items-center gap-1.5 border-b-2 border-divider py-1.5 pl-1.5 pr-4 sm:pl-6 sm:pr-10">
        <Link
          href="/orders"
          className="grid size-11 place-items-center text-[20px] text-text no-underline hover:text-text"
          aria-label="Back to orders"
        >
          ←
        </Link>
        <b className="flex-1">{o.order_no}</b>
        <StatusBadge status={o.status} audience="customer" />
      </div>
      <div className="mx-auto max-w-[640px] px-5 pb-10 pt-5">
        <OrderDetail o={o} variant="page" />
      </div>
    </>
  );
}
